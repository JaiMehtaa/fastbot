import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import { PROMPT_REGISTRY, type PromptResolverFn } from "@whatsapp-bot-platform/prompt-config";
import type { PhraseContext, PhraseQuestionFn } from "./question-phraser.js";

export const DEFAULT_PHRASER_MODEL = "gpt-4o-mini";

export const PHRASER_PROMPT_KEY = "question_phraser";

/**
 * Re-exported from packages/prompt-config's PROMPT_REGISTRY, the single
 * source of truth apps/admin also reads from. The whole editable surface
 * for this call site — no structured-output contract to protect (this
 * returns plain text, not JSON), so apps/admin can freely rewrite this
 * without risking a parsing break, unlike the classifier/extractor
 * prompts below.
 */
export const DEFAULT_PHRASER_INSTRUCTIONS = PROMPT_REGISTRY.question_phraser.default;

function buildPrompt(instructions: string, context: PhraseContext): string {
  const who = context.ownerName ? ` The person you're talking to is named ${context.ownerName}.` : "";
  const biz = context.businessName ? ` Their business is called ${context.businessName}.` : "";
  return `${instructions}${who}${biz}\n\nMessage to rephrase: "${context.rawText}"\n\nRespond with ONLY the rephrased message, nothing else.`;
}

/**
 * Real question phrasing via OpenAI — the static interviewHint strings in
 * packages/schema's primitive definitions (and interview-session.ts's
 * catch-all/summary/confirmation text) are functional placeholders, not
 * the product's actual voice (docs/planning-log.md deliberately deferred
 * this). This is the real implementation. Per question-phraser.ts's
 * contract it never throws: a phrasing failure (network error, rate
 * limit, empty response) falls back to the raw text rather than ever
 * blocking a turn on cosmetic wording.
 *
 * `getInstructions` defaults to the hardcoded DEFAULT_PHRASER_INSTRUCTIONS
 * but is meant to be createPromptTemplateResolver(db, PHRASER_PROMPT_KEY,
 * DEFAULT_PHRASER_INSTRUCTIONS) in production — apps/admin edits what this
 * resolves to, no code deploy required.
 */
export function createLlmPhraseQuestion(
  client: OpenAiClient,
  getInstructions: PromptResolverFn = async () => DEFAULT_PHRASER_INSTRUCTIONS,
  model: string = DEFAULT_PHRASER_MODEL,
): PhraseQuestionFn {
  return async function llmPhraseQuestion(context): Promise<string> {
    try {
      const instructions = await getInstructions();
      const response = await client.chat({
        model,
        messages: [{ role: "user", content: buildPrompt(instructions, context) }],
        temperature: 0.7,
      });
      const phrased = response.content.trim();
      return phrased || context.rawText;
    } catch {
      return context.rawText;
    }
  };
}
