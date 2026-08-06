import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import { PROMPT_REGISTRY, type PromptResolverFn } from "@whatsapp-bot-platform/prompt-config";
import type { ExtractOwnerInfoFn, OwnerInfoExtraction } from "./owner-info-extractor.js";

export const DEFAULT_OWNER_INFO_MODEL = "gpt-4o-mini";

export const OWNER_INFO_PROMPT_KEY = "owner_info_extractor";

/**
 * Re-exported from packages/prompt-config's PROMPT_REGISTRY. The editable
 * framing — the field-by-field extraction spec and JSON output contract
 * below stay code-generated and are always appended, tied to
 * RESPONSE_SCHEMA's strict shape.
 */
export const DEFAULT_OWNER_INFO_INSTRUCTIONS = PROMPT_REGISTRY.owner_info_extractor.default;

const RESPONSE_SCHEMA = {
  name: "owner_info_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      name: { type: ["string", "null"] },
      nameConfidence: { type: "number" },
      contact: { type: ["string", "null"] },
      contactConfidence: { type: "number" },
    },
    required: ["name", "nameConfidence", "contact", "contactConfidence"],
    additionalProperties: false,
  },
};

function buildPrompt(instructions: string, freeText: string): string {
  return (
    `${instructions} Extract:\n` +
    "- name: their personal name as given, or null if not mentioned\n" +
    "- nameConfidence: 0 to 1\n" +
    "- contact: the phone number or email exactly as given, or null if not mentioned\n" +
    "- contactConfidence: 0 to 1\n\n" +
    `Do not guess — if either isn't clearly present, use null and a confidence of 0.\n\nMessage: "${freeText}"`
  );
}

function clamp(value: unknown): number {
  return typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * Real owner-info extraction via OpenAI — production replacement for
 * heuristic-owner-info-extractor.ts's regex-based approximation, same role
 * llm-extractor.ts plays for primitive field extraction.
 */
export function createLlmExtractOwnerInfo(
  client: OpenAiClient,
  getInstructions: PromptResolverFn = async () => DEFAULT_OWNER_INFO_INSTRUCTIONS,
  model: string = DEFAULT_OWNER_INFO_MODEL,
): ExtractOwnerInfoFn {
  return async function llmExtractOwnerInfo(freeText): Promise<OwnerInfoExtraction> {
    const instructions = await getInstructions();
    const response = await client.chat({
      model,
      messages: [{ role: "user", content: buildPrompt(instructions, freeText) }],
      temperature: 0,
      responseFormat: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    });

    let parsed: { name?: unknown; nameConfidence?: unknown; contact?: unknown; contactConfidence?: unknown };
    try {
      parsed = JSON.parse(response.content);
    } catch {
      return { name: null, contact: null };
    }

    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? { value: parsed.name, confidence: clamp(parsed.nameConfidence) } : null,
      contact:
        typeof parsed.contact === "string" && parsed.contact.trim()
          ? { value: parsed.contact, confidence: clamp(parsed.contactConfidence) }
          : null,
    };
  };
}
