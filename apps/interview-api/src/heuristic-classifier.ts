import { lobRecipes } from "@whatsapp-bot-platform/schema";
import type { LobRecipe } from "@whatsapp-bot-platform/shared-types";
import type { ClassifyLobFn } from "./lob-classifier.js";

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter((token) => token.length > 2));
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

/**
 * Local, no-LLM stand-in for real LOB classification: token-overlap scoring
 * against lob_recipes.classification_examples. Genuinely limited — no real
 * language understanding — but it's what lets the full interview flow work
 * end-to-end (and the server run at all) before a real OpenAI-backed
 * classifier exists. Swap this out for a real ClassifyLobFn later; nothing
 * else changes since lob-classifier.ts only depends on the function shape.
 */
export const heuristicClassifyLob: ClassifyLobFn = async (freeText, candidates) => {
  const textTokens = tokenize(freeText);
  let best: { recipe: LobRecipe; score: number } | null = null;

  for (const recipe of candidates) {
    for (const example of recipe.classificationExamples) {
      const score = overlapScore(textTokens, tokenize(example));
      if (!best || score > best.score) {
        best = { recipe, score };
      }
    }
  }

  if (!best || best.score < 0.15) {
    return { lobKey: "minimal_support", confidence: 0.2, reason: "no confident token overlap with any recipe's examples" };
  }

  // maps raw overlap into a band that clears the classifier's 0.6 acceptance threshold for clear matches
  const confidence = Math.min(0.95, 0.5 + best.score);
  return { lobKey: best.recipe.key, confidence, reason: `token overlap ${best.score.toFixed(2)} with "${best.recipe.key}"` };
};
