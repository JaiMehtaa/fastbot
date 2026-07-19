import type {
  GenerateAttempt,
  GenerateWithConfidenceOptions,
  GenerateWithConfidenceResult,
} from "./types.js";

/**
 * The one shared generate -> score -> retry-or-reject primitive used by every
 * LLM call site in the system (interview field extraction, faq_support
 * fallback, LOB classification). A low-confidence output is never returned
 * as if it were good — callers get a `low_confidence` result and decide what
 * that means for their touchpoint (don't commit the field, route to
 * human_escalation, ask a clarifying question, etc).
 *
 * `generate` and `score` are injected rather than hardcoded to a provider,
 * which is what makes this fully unit-testable without a live LLM call.
 */
export async function generateWithConfidence<T>(
  options: GenerateWithConfidenceOptions<T>,
): Promise<GenerateWithConfidenceResult<T>> {
  const { generate, score, threshold, maxAttempts } = options;
  if (maxAttempts < 1) {
    throw new Error(`maxAttempts must be >= 1, got ${maxAttempts}`);
  }

  const previousAttempts: GenerateAttempt<T>[] = [];
  let lastAttempt: GenerateAttempt<T> | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await generate({ attempt, previousAttempts });
    const confidence = score ? (await score(result.output)).confidence : result.confidence;
    const scored: GenerateAttempt<T> = { ...result, confidence };

    if (confidence >= threshold) {
      return { status: "accepted", output: scored.output, confidence, attempts: attempt };
    }

    previousAttempts.push(scored);
    lastAttempt = scored;
  }

  if (!lastAttempt) {
    throw new Error("unreachable: maxAttempts >= 1 guarantees at least one attempt ran");
  }

  return {
    status: "low_confidence",
    lastOutput: lastAttempt.output,
    lastConfidence: lastAttempt.confidence,
    attempts: maxAttempts,
  };
}
