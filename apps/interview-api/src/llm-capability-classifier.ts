import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import { PROMPT_REGISTRY, type PromptResolverFn } from "@whatsapp-bot-platform/prompt-config";
import type { PrimitiveKey, PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";
import type { CapabilityClassification, ClassifyCapabilitiesFn } from "./capability-classifier.js";

export const DEFAULT_CAPABILITY_CLASSIFIER_MODEL = "gpt-4o-mini";

export const CLASSIFIER_PROMPT_KEY = "capability_classifier";

/**
 * Re-exported from packages/prompt-config's PROMPT_REGISTRY. The editable
 * "what should this filter for / weigh" framing — the candidate list, the
 * business description, and the output-format instructions below stay
 * code-generated and are always appended after this, since the response
 * must keep matching RESPONSE_SCHEMA's strict json_schema contract for
 * downstream parsing to work at all.
 */
export const DEFAULT_CLASSIFIER_INSTRUCTIONS = PROMPT_REGISTRY.capability_classifier.default;

const RESPONSE_SCHEMA = {
  name: "capability_classification",
  strict: true,
  schema: {
    type: "object",
    properties: {
      selectedPrimitives: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
    required: ["selectedPrimitives", "confidence", "reason"],
    additionalProperties: false,
  },
};

function buildPrompt(instructions: string, freeText: string, candidates: readonly PrimitiveSchema[]): string {
  const options = candidates
    .map((schema) => `- key: "${schema.key}" (${schema.entryLabel}) — ${schema.label}`)
    .join("\n");

  return (
    `${instructions}\n\n${options}\n\nBusiness owner's description: "${freeText}"\n\n` +
    `Respond with the list of matching keys (can be zero, one, or several — a business can need catalogue AND ` +
    `faq_support at once, don't force a single choice), a confidence from 0 to 1 (how sure you are these are the ` +
    `right capabilities, not just plausible ones), and a one-sentence reason. Only include a capability if the ` +
    `description gives real signal for it — do not include one just because it's common. If the description is ` +
    `too vague to tell anything apart, prefer a low confidence and an empty list over guessing.`
  );
}

function isPrimitiveKey(value: unknown, candidates: readonly PrimitiveSchema[]): value is PrimitiveKey {
  return typeof value === "string" && candidates.some((c) => c.key === value);
}

/**
 * Real capability classification via OpenAI — production replacement for
 * heuristic-capability-classifier.ts's keyword-overlap approximation, same
 * role llm-classifier.ts played for the old single-LOB-key classification.
 * Self-reported confidence, same rationale as llm-classifier.ts.
 *
 * `getInstructions` defaults to the hardcoded DEFAULT_CLASSIFIER_INSTRUCTIONS
 * but is meant to be createPromptTemplateResolver(db, CLASSIFIER_PROMPT_KEY,
 * DEFAULT_CLASSIFIER_INSTRUCTIONS) in production — apps/admin edits what
 * this resolves to, no code deploy required. Only the framing is editable;
 * the candidate list and output-format instructions are always appended by
 * code so an admin edit can't accidentally break RESPONSE_SCHEMA parsing.
 */
export function createLlmClassifyCapabilities(
  client: OpenAiClient,
  getInstructions: PromptResolverFn = async () => DEFAULT_CLASSIFIER_INSTRUCTIONS,
  model: string = DEFAULT_CAPABILITY_CLASSIFIER_MODEL,
): ClassifyCapabilitiesFn {
  return async function llmClassifyCapabilities(freeText, candidates): Promise<CapabilityClassification> {
    const instructions = await getInstructions();
    const response = await client.chat({
      model,
      messages: [{ role: "user", content: buildPrompt(instructions, freeText, candidates) }],
      temperature: 0,
      responseFormat: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    });

    let parsed: { selectedPrimitives?: unknown; confidence?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(response.content);
    } catch {
      return { selectedPrimitives: [], confidence: 0, reason: "Model response was not valid JSON." };
    }

    if (!Array.isArray(parsed.selectedPrimitives) || typeof parsed.confidence !== "number") {
      return { selectedPrimitives: [], confidence: 0, reason: "Model response was missing required fields." };
    }

    const validKeys = parsed.selectedPrimitives.filter((key): key is PrimitiveKey => isPrimitiveKey(key, candidates));

    return {
      selectedPrimitives: validKeys,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  };
}
