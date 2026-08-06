import { getPrimitive } from "@whatsapp-bot-platform/schema";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import { PROMPT_REGISTRY, type PromptResolverFn } from "@whatsapp-bot-platform/prompt-config";
import type { FieldDefinition, MissingField } from "@whatsapp-bot-platform/shared-types";
import type { ExtractFieldsFn, FieldExtraction } from "./field-extractor.js";

export const DEFAULT_EXTRACTOR_MODEL = "gpt-4o-mini";

export const EXTRACTOR_PROMPT_KEY = "field_extractor";

/**
 * Re-exported from packages/prompt-config's PROMPT_REGISTRY. The editable
 * framing — field descriptions and the JSON output-format instructions in
 * buildPrompt() below stay code-generated and are always appended, since
 * the response must keep matching the shape createLlmExtractFields'
 * parsing (and hasValidShape's per-field checks) expects.
 */
export const DEFAULT_EXTRACTOR_INSTRUCTIONS = PROMPT_REGISTRY.field_extractor.default;

function findFieldDefinition(missingField: MissingField): FieldDefinition | undefined {
  const schema = getPrimitive(missingField.primitiveKey);
  return [...schema.requiredFields, ...schema.optionalFields].find((f) => f.key === missingField.fieldKey);
}

function describeField(missingField: MissingField, field: FieldDefinition): string {
  const parts = [`- primitiveKey: "${missingField.primitiveKey}", fieldKey: "${field.key}" (${field.label})`];
  parts.push(`  type: ${field.type}`);
  if (field.type === "enum" && field.enumValues) {
    parts.push(`  allowed values: ${field.enumValues.join(", ")}`);
  }
  if (field.type === "array" && field.itemFields) {
    const shape = field.itemFields.map((f) => `${f.key} (${f.type}${f.required ? ", required" : ""})`).join(", ");
    parts.push(`  value must be an array of objects shaped { ${shape} }`);
  }
  if (field.type === "weekly_hours") {
    parts.push(
      '  value must be an object with ONE KEY PER DAY actually covered by the answer (monday, tuesday, wednesday, ' +
        "thursday, friday, saturday, sunday) — expand a range or 'every day' into one entry per day, do NOT " +
        'collapse multiple days into a single key. Example for "Mon-Sat 9am-6pm, closed Sundays": { "monday": ' +
        '"9am-6pm", "tuesday": "9am-6pm", "wednesday": "9am-6pm", "thursday": "9am-6pm", "friday": "9am-6pm", ' +
        '"saturday": "9am-6pm", "sunday": "closed" }. If no specific days are named at all, use { "note": "<verbatim answer>" } instead.',
    );
  }
  parts.push(`  what we're asking the business: ${field.interviewHint}`);
  return parts.join("\n");
}

function buildPrompt(
  instructions: string,
  freeText: string,
  fields: readonly { missingField: MissingField; def: FieldDefinition }[],
): string {
  const fieldDescriptions = fields.map(({ missingField, def }) => describeField(missingField, def)).join("\n");
  return (
    `${instructions}\n\nFields still needed:\n${fieldDescriptions}\n\n` +
    `Business owner's message: "${freeText}"\n\n` +
    `Respond with ONLY JSON (no markdown, no prose): {"extractions": [...]}, where "extractions" is an array ` +
    `with one object per field you could confidently extract: {"primitiveKey": "...", "fieldKey": "...", ` +
    `"value": <matching the field's type above>, "confidence": <0 to 1>, "reason": "..."}. If the message ` +
    `addresses none of the fields, respond with {"extractions": []}.`
  );
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced ? fenced[1]!.trim() : trimmed;
}

function hasValidShape(value: unknown, def: FieldDefinition): boolean {
  switch (def.type) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "weekly_hours":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array": {
      if (!Array.isArray(value) || value.length === 0) return false;
      const requiredKeys = (def.itemFields ?? []).filter((f) => f.required).map((f) => f.key);
      return value.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          requiredKeys.every((key) => typeof (item as Record<string, unknown>)[key] === "string" && (item as Record<string, unknown>)[key] !== ""),
      );
    }
    case "enum":
      return typeof value === "string" && (!def.enumValues || def.enumValues.includes(value));
    default:
      return typeof value === "string" && value.trim().length > 0;
  }
}

/**
 * Real field extraction via OpenAI — the production replacement for
 * heuristic-extractor.ts's regex-based approximation. Unlike the heuristic
 * version (deliberately limited to missingFields[0], one field per turn),
 * this asks the model about every currently-missing field in one call, so a
 * single message like "we're Zap Home Care, open 9-7 daily" can commit both
 * business_name and hours in one turn (docs/architecture.md's own example).
 * extractFields() in field-extractor.ts already gates every returned
 * extraction on confidence >= 0.6, so this function's job is just to return
 * honest per-field confidences — it also independently validates each
 * value's shape against the field's declared type and drops anything
 * malformed, rather than trusting the model's JSON at face value.
 */
export function createLlmExtractFields(
  client: OpenAiClient,
  getInstructions: PromptResolverFn = async () => DEFAULT_EXTRACTOR_INSTRUCTIONS,
  model: string = DEFAULT_EXTRACTOR_MODEL,
): ExtractFieldsFn {
  return async function llmExtractFields({ freeText, missingFields }): Promise<readonly FieldExtraction[]> {
    const resolved = missingFields
      .map((missingField) => ({ missingField, def: findFieldDefinition(missingField) }))
      .filter((f): f is { missingField: MissingField; def: FieldDefinition } => f.def !== undefined);
    if (resolved.length === 0) return [];

    const instructions = await getInstructions();
    const response = await client.chat({
      model,
      messages: [{ role: "user", content: buildPrompt(instructions, freeText, resolved) }],
      temperature: 0,
      responseFormat: { type: "json_object" },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(response.content));
    } catch {
      return [];
    }
    if (typeof parsed !== "object" || parsed === null) return [];

    // response_format: json_object forces a top-level object, not an array, so the
    // prompt asks for {"extractions": [...]} — but real models don't always comply
    // exactly. Discovered live: when only one field is being asked about, gpt-4o-mini
    // sometimes returns the single extraction object directly with no wrapper at all
    // (e.g. {"primitiveKey": "...", "fieldKey": "...", ...}), which every other shape
    // check below missed entirely — accept any array-valued property as a fallback,
    // and a single bare extraction-shaped object as a last resort.
    let candidates: unknown;
    if (Array.isArray(parsed)) {
      candidates = parsed;
    } else {
      const record = parsed as Record<string, unknown>;
      const arrayProperty = Object.values(record).find((v) => Array.isArray(v));
      candidates = arrayProperty ?? (typeof record.primitiveKey === "string" && typeof record.fieldKey === "string" ? [record] : []);
    }
    if (!Array.isArray(candidates)) return [];

    const byKey = new Map(resolved.map((f) => [`${f.missingField.primitiveKey}.${f.def.key}`, f.def]));
    const extractions: FieldExtraction[] = [];

    for (const item of candidates) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      const def = byKey.get(`${record.primitiveKey}.${record.fieldKey}`);
      if (!def || typeof record.confidence !== "number" || !hasValidShape(record.value, def)) continue;

      extractions.push({
        primitiveKey: record.primitiveKey as FieldExtraction["primitiveKey"],
        fieldKey: record.fieldKey as string,
        value: record.value,
        confidence: Math.max(0, Math.min(1, record.confidence)),
        reason: typeof record.reason === "string" ? record.reason : undefined,
      });
    }

    return extractions;
  };
}
