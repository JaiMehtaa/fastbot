import { lobRecipes } from "@whatsapp-bot-platform/schema";
import { generateWithConfidence } from "@whatsapp-bot-platform/eval";
import type { LobRecipe } from "@whatsapp-bot-platform/shared-types";

export interface LobClassification {
  lobKey: string;
  confidence: number;
  reason?: string;
}

export type ClassifyLobFn = (freeText: string, candidates: readonly LobRecipe[]) => Promise<LobClassification>;

const CONFIDENCE_THRESHOLD = 0.6;

export type ClassifyResult = { status: "classified"; lobKey: string } | { status: "low_confidence"; reason?: string };

/**
 * A single classification attempt against the current turn's free text —
 * deliberately NOT a multi-attempt retry. generateWithConfidence's in-loop
 * retry regenerates immediately, same turn, which is the wrong shape for
 * "ask the user a clarifying question and wait for their next message."
 * That behavior spans multiple conversational turns and is modeled as
 * session state in interview-session.ts instead (docs/architecture.md,
 * "Interview Agent Design", point 5: "ask one clarifying question, then
 * fall back to a safe minimal recipe"). Routing this single attempt through
 * generateWithConfidence still buys the shared "never trust a low-confidence
 * output silently" guarantee, even with maxAttempts: 1.
 */
export async function classifyLob(freeText: string, classifyFn: ClassifyLobFn): Promise<ClassifyResult> {
  const result = await generateWithConfidence<LobClassification>({
    generate: async () => {
      const classification = await classifyFn(freeText, lobRecipes);
      return { output: classification, confidence: classification.confidence, reason: classification.reason };
    },
    threshold: CONFIDENCE_THRESHOLD,
    maxAttempts: 1,
  });

  if (result.status === "accepted") {
    return { status: "classified", lobKey: result.output.lobKey };
  }
  return { status: "low_confidence", reason: result.lastReason };
}
