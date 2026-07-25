import { generateWithConfidence, type OpenAiClient } from "@whatsapp-bot-platform/eval";
import type { FaqFallbackFn } from "./handlers/faq-support.js";

export const DEFAULT_FAQ_ANSWER_MODEL = "gpt-4o-mini";
export const DEFAULT_FAQ_JUDGE_MODEL = "gpt-4o-mini";

const GROUNDEDNESS_THRESHOLD = 0.7;
const MAX_ATTEMPTS = 2;

interface Faq {
  question: string;
  answer: string;
}

function formatFaqs(faqs: readonly Faq[]): string {
  return faqs.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join("\n");
}

async function generateAnswer(
  client: OpenAiClient,
  model: string,
  question: string,
  faqs: readonly Faq[],
  feedback?: string,
): Promise<string> {
  const feedbackNote = feedback
    ? `\n\nYour previous attempt was rejected: ${feedback}. Answer again, staying strictly within the FAQ content.`
    : "";
  const response = await client.chat({
    model,
    messages: [
      {
        role: "user",
        content:
          `A customer asked a WhatsApp bot a question. Answer using ONLY the information in the FAQ list below — ` +
          `never add facts, policies, or details that aren't stated there. If the FAQs don't cover this question ` +
          `at all, respond with exactly: NOT_COVERED.\n\nFAQs:\n${formatFaqs(faqs)}\n\n` +
          `Customer's question: "${question}"${feedbackNote}`,
      },
    ],
    temperature: 0.2,
  });
  return response.content.trim();
}

interface JudgeResult {
  confidence: number;
  reason?: string;
}

async function judgeGroundedness(
  client: OpenAiClient,
  model: string,
  question: string,
  faqs: readonly Faq[],
  answer: string,
): Promise<JudgeResult> {
  const response = await client.chat({
    model,
    messages: [
      {
        role: "user",
        content:
          `A customer asked: "${question}"\n\nA draft answer was generated: "${answer}"\n\n` +
          `The ONLY source of truth is this FAQ list:\n${formatFaqs(faqs)}\n\n` +
          `Score, from 0 to 1, how confident you are that the draft answer is fully supported by the FAQ list ` +
          `above and does not state anything beyond it. A score of 1 means every claim in the answer traces ` +
          `directly back to the FAQs; a score near 0 means the answer invents or assumes things not stated. ` +
          `Respond with ONLY JSON: {"confidence": <0 to 1>, "reason": "..."}.`,
      },
    ],
    temperature: 0,
    responseFormat: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(response.content) as { confidence?: unknown; reason?: unknown };
    if (typeof parsed.confidence !== "number") return { confidence: 0, reason: "Judge response missing confidence." };
    return {
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return { confidence: 0, reason: "Judge response was not valid JSON." };
  }
}

/**
 * Real faq_support fallback via OpenAI — the highest-stakes LLM call
 * site in the system (docs/architecture.md, "Knowledge Strategy &
 * Confidence/Eval Layer"): it's the one that can reach a real customer with
 * a wrong answer if it's not gated properly. Uses a separate judge call
 * rather than self-reported confidence, since a model grading its own
 * answer is poorly calibrated — the generation call doesn't get to decide
 * it did a good job. Routed through generateWithConfidence so a low-scoring
 * first attempt gets one retry with the judge's own feedback folded back in
 * as a correction; exhausting attempts returns null, which
 * createFaqSupportHandler already treats as "hand off to human_escalation"
 * rather than ever showing a possibly-wrong answer to the customer.
 */
export function createLlmFaqFallback(
  client: OpenAiClient,
  options: { answerModel?: string; judgeModel?: string } = {},
): FaqFallbackFn {
  const answerModel = options.answerModel ?? DEFAULT_FAQ_ANSWER_MODEL;
  const judgeModel = options.judgeModel ?? DEFAULT_FAQ_JUDGE_MODEL;

  return async function llmFaqFallback(question, faqs) {
    if (faqs.length === 0) return null;

    const result = await generateWithConfidence<string>({
      generate: async ({ attempt, previousAttempts }) => {
        const feedback = previousAttempts[previousAttempts.length - 1]?.reason;
        const answer = await generateAnswer(client, answerModel, question, faqs, attempt > 1 ? feedback : undefined);
        return { output: answer, confidence: 0 };
      },
      score: async (answer) => {
        if (answer === "NOT_COVERED" || answer.length === 0) {
          return { confidence: 0, reason: "Model reported the question isn't covered by the FAQs." };
        }
        return judgeGroundedness(client, judgeModel, question, faqs, answer);
      },
      threshold: GROUNDEDNESS_THRESHOLD,
      maxAttempts: MAX_ATTEMPTS,
    });

    if (result.status === "low_confidence") return null;
    return { answer: result.output };
  };
}
