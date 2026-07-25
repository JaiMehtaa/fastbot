import { getPrimitive } from "@whatsapp-bot-platform/schema";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import type { FieldDefinition, MissingField } from "@whatsapp-bot-platform/shared-types";
import type { ExtractFieldsFn, FieldExtraction } from "./field-extractor.js";

export const DEFAULT_EXTRACTOR_MODEL = "gpt-4o-mini";

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
    parts.push('  value must be an object like { "monday": "9am-6pm" } or { "note": "closed on Sundays" }');
  }
  parts.push(`  what we're asking the business: ${field.interviewHint}`);
  return parts.join("\n");
}

function buildPrompt(freeText: string, fields: readonly { missingField: MissingField; def: FieldDefinition }[]): string {
  const fieldDescriptions = fields.map(({ missingField, def }) => describeField(missingField, def)).join("\n");
  return (
    `A business owner is being interviewed to set up a WhatsApp bot. Extract answers to any of the ` +
    `following fields that their latest message actually addresses — a single message can answer more than ` +
    `one field at once. Do NOT include a field in your response if the message doesn't address it; do NOT ` +
    `guess or invent a value.\n\nFields still needed:\n${fieldDescriptions}\n\n` +
    `Business owner's message: "${freeText}"\n\n` +
    `Respond with ONLY a JSON array (no markdown, no prose), one object per field you could confidently ` +
    `extract: [{"primitiveKey": "...", "fieldKey": "...", "value": <matching the field's type above>, ` +
    `"confidence": <0 to 1>, "reason": "..."}]. If the message addresses none of the fields, respond with [].`
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
export function createLlmExtractFields(client: OpenAiClient, model: string = DEFAULT_EXTRACTOR_MODEL): ExtractFieldsFn {
  return async function llmExtractFields({ freeText, missingFields }): Promise<readonly FieldExtraction[]> {
    const resolved = missingFields
      .map((missingField) => ({ missingField, def: findFieldDefinition(missingField) }))
      .filter((f): f is { missingField: MissingField; def: FieldDefinition } => f.def !== undefined);
    if (resolved.length === 0) return [];

    const response = await client.chat({
      model,
      messages: [{ role: "user", content: buildPrompt(freeText, resolved) }],
      temperature: 0,
      responseFormat: { type: "json_object" },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(response.content));
    } catch {
      return [];
    }

    // some models wrap a requested array in a top-level object (e.g. {"extractions": [...]})
    // despite the prompt asking for a bare array — accept the first array-valued property too
    const candidates = Array.isArray(parsed)
      ? parsed
      : (Object.values(parsed as Record<string, unknown>).find((v) => Array.isArray(v)) ?? []);
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
