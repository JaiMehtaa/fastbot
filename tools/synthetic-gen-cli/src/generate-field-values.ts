import { getPrimitive } from "@whatsapp-bot-platform/schema";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import type { GenerateFieldValuesFn } from "@whatsapp-bot-platform/synthetic-gen";
import type { FieldDefinition } from "@whatsapp-bot-platform/shared-types";

const MODEL = "gpt-4o-mini";

function describeField(field: FieldDefinition): string {
  const parts = [`- "${field.key}" (${field.label}), type: ${field.type}${field.required ? ", required" : ", optional"}`];
  if (field.type === "enum" && field.enumValues) {
    parts.push(`  allowed values: ${field.enumValues.join(", ")}`);
  }
  if (field.type === "array" && field.itemFields) {
    const shape = field.itemFields.map((f) => `${f.key} (${f.type}${f.required ? ", required" : ""})`).join(", ");
    parts.push(`  an array of objects shaped { ${shape} }${field.minItems ? `, at least ${field.minItems} item(s)` : ""}`);
  }
  if (field.type === "weekly_hours") {
    parts.push('  an object with one key per day actually covered (e.g. {"monday": "9:00-18:00", "sunday": "closed"})');
  }
  if (field.example !== undefined) {
    parts.push(`  example: ${JSON.stringify(field.example)}`);
  }
  return parts.join("\n");
}

function buildPrompt(vertical: string, primitiveKey: string, fields: readonly FieldDefinition[], retryReason?: string): string {
  const fieldDescriptions = fields.map(describeField).join("\n");
  const retryNote = retryReason
    ? `\n\nYour previous attempt was rejected: ${retryReason}. Fix that specifically this time.`
    : "";
  return (
    `You are inventing a realistic, internally-consistent small business for testing purposes. The business is: ${vertical}\n\n` +
    `Invent plausible field values for the "${primitiveKey}" section of that business's WhatsApp bot configuration. ` +
    `Fields:\n${fieldDescriptions}${retryNote}\n\n` +
    `Respond with ONLY a JSON object mapping each field key to its value — no markdown, no prose, no wrapper object. ` +
    `Every "required" field above must be present and non-empty. Make the values sound like a real business, not a placeholder.`
  );
}

/**
 * The generateFieldValues DI point packages/synthetic-gen's
 * generateGroundTruthDraft() expects — a real OpenAI call per primitive,
 * matching the field-generation half of the LOB's own claimed methodology
 * (structured output, then a deterministic post-generation validation pass
 * — here that's generateGroundTruthDraft's own validateDraft-scored retry
 * loop, not this function trusting its own output). Malformed JSON is
 * treated as an empty object rather than thrown — validateDraft naturally
 * reports it as missing required fields, which feeds back as retry
 * guidance exactly like a genuinely incomplete generation would.
 */
export function createLlmGenerateFieldValues(client: OpenAiClient, vertical: string): GenerateFieldValuesFn {
  return async ({ primitiveKey, previousAttempts }) => {
    const schema = getPrimitive(primitiveKey);
    const fields = [...schema.requiredFields, ...schema.optionalFields];
    const retryReason = previousAttempts[previousAttempts.length - 1]?.reason;
    const prompt = buildPrompt(vertical, primitiveKey, fields, retryReason);

    const response = await client.chat({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      responseFormat: { type: "json_object" },
    });

    try {
      const parsed: unknown = JSON.parse(response.content);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  };
}
