import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import type { LobRecipe } from "@whatsapp-bot-platform/shared-types";
import type { ClassifyLobFn, LobClassification } from "./lob-classifier.js";

export const DEFAULT_CLASSIFIER_MODEL = "gpt-4o-mini";

const RESPONSE_SCHEMA = {
  name: "lob_classification",
  strict: true,
  schema: {
    type: "object",
    properties: {
      lobKey: { type: "string" },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
    required: ["lobKey", "confidence", "reason"],
    additionalProperties: false,
  },
};

function buildPrompt(freeText: string, candidates: readonly LobRecipe[]): string {
  const options = candidates
    .map((recipe) => {
      const examples = recipe.classificationExamples.length
        ? recipe.classificationExamples.map((e) => `    - "${e}"`).join("\n")
        : "    (no examples — this is the general fallback for anything that doesn't clearly fit elsewhere)";
      return `- key: "${recipe.key}" (${recipe.label})\n  example descriptions:\n${examples}`;
    })
    .join("\n");

  return (
    `A business owner just described their business. Classify it into exactly one of these line-of-business ` +
    `categories, by key:\n\n${options}\n\nBusiness owner's description: "${freeText}"\n\n` +
    `Respond with the closest matching key, a confidence from 0 to 1 (how sure you are this is the right ` +
    `category, not just the least-wrong one), and a one-sentence reason. If the description is too vague or ` +
    `doesn't clearly match any specific category, prefer a low confidence over guessing.`
  );
}

/**
 * Real LOB classification via OpenAI — the production replacement for
 * heuristic-classifier.ts's token-overlap approximation. Self-reported
 * confidence per docs/architecture.md ("Knowledge Strategy & Confidence/Eval
 * Layer": LOB classification is self-reported, cheap, keeps latency low) —
 * classifyLob() in lob-classifier.ts already wraps whatever ClassifyLobFn is
 * passed through generateWithConfidence, so this function's only job is
 * producing one honest {lobKey, confidence, reason} triple, same contract
 * the heuristic implementation fulfills.
 */
export function createLlmClassifyLob(client: OpenAiClient, model: string = DEFAULT_CLASSIFIER_MODEL): ClassifyLobFn {
  return async function llmClassifyLob(freeText, candidates): Promise<LobClassification> {
    const response = await client.chat({
      model,
      messages: [{ role: "user", content: buildPrompt(freeText, candidates) }],
      temperature: 0,
      responseFormat: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    });

    let parsed: { lobKey?: unknown; confidence?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(response.content);
    } catch {
      return { lobKey: "", confidence: 0, reason: "Model response was not valid JSON." };
    }

    const validKey = candidates.some((c) => c.key === parsed.lobKey);
    if (!validKey || typeof parsed.confidence !== "number") {
      return {
        lobKey: "",
        confidence: 0,
        reason: `Model returned an unrecognized lobKey "${String(parsed.lobKey)}".`,
      };
    }

    return {
      lobKey: parsed.lobKey as string,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  };
}
