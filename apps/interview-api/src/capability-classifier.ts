import { generateWithConfidence } from "@whatsapp-bot-platform/eval";
import { PRIMITIVE_KEYS, type PrimitiveKey, type PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";

export interface CapabilityClassification {
  selectedPrimitives: PrimitiveKey[];
  confidence: number;
  reason?: string;
}

export type ClassifyCapabilitiesFn = (
  freeText: string,
  candidates: readonly PrimitiveSchema[],
) => Promise<CapabilityClassification>;

const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Every draft gets these regardless of what the classifier detects: every
 * business has a name/description/hours, and human_escalation is the safety
 * net every other primitive (faq_support's low-confidence fallback, and
 * validateDraft's cross-primitive check) routes to.
 */
export const BASELINE_PRIMITIVES: readonly PrimitiveKey[] = ["business_info", "human_escalation"];

export type CapabilityResult =
  | { status: "classified"; selectedPrimitives: PrimitiveKey[] }
  | { status: "low_confidence"; reason?: string };

/**
 * Sorted by PRIMITIVE_KEYS' declared order (business_info, catalogue,
 * faq_support, human_escalation, ...) rather than Set-insertion order.
 * validateDraft asks about selectedPrimitives' *first* missing field in
 * array order, so this order IS the interview's question order — e.g.
 * human_escalation must stay after catalogue/faq_support, or its
 * escalation_prompt question jumps the queue and a customer's catalogue
 * answer ends up silently filling the wrong field.
 */
export function sortByCanonicalOrder(primitives: readonly PrimitiveKey[]): PrimitiveKey[] {
  return [...primitives].sort((a, b) => PRIMITIVE_KEYS.indexOf(a) - PRIMITIVE_KEYS.indexOf(b));
}

function withBaseline(primitives: readonly PrimitiveKey[]): PrimitiveKey[] {
  const merged = new Set<PrimitiveKey>(BASELINE_PRIMITIVES);
  for (const key of primitives) merged.add(key);
  return sortByCanonicalOrder([...merged]);
}

/**
 * Replaces lob-classifier.ts's one-shot "pick one of two recipes" lookup:
 * classifies which primitives apply directly from free text, against
 * whatever the live registry actually supports (candidates come from
 * packages/schema's listPrimitives(), so a new primitive becomes
 * selectable the moment it's registered — no change needed here). Same
 * single-attempt generateWithConfidence wrapping as classifyLob — the
 * "ask a clarifying question, then fall back" retry lives in
 * interview-session.ts's turn state, not here.
 */
export async function classifyCapabilities(
  freeText: string,
  candidates: readonly PrimitiveSchema[],
  classifyFn: ClassifyCapabilitiesFn,
): Promise<CapabilityResult> {
  const result = await generateWithConfidence<CapabilityClassification>({
    generate: async () => {
      const classification = await classifyFn(freeText, candidates);
      return { output: classification, confidence: classification.confidence, reason: classification.reason };
    },
    threshold: CONFIDENCE_THRESHOLD,
    maxAttempts: 1,
  });

  if (result.status === "accepted") {
    return { status: "classified", selectedPrimitives: withBaseline(result.output.selectedPrimitives) };
  }
  return { status: "low_confidence", reason: result.lastReason };
}
