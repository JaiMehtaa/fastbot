import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWithConfidence } from "./generate-with-confidence.js";
import type { GenerateContext } from "./types.js";

test("accepts on the first attempt when self-reported confidence meets the threshold", async () => {
  let calls = 0;
  const result = await generateWithConfidence<string>({
    generate: async () => {
      calls += 1;
      return { output: "hello", confidence: 0.9 };
    },
    threshold: 0.7,
    maxAttempts: 3,
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "accepted", output: "hello", confidence: 0.9, attempts: 1 });
});

test("retries on low confidence and accepts once a later attempt clears the threshold", async () => {
  const confidences = [0.3, 0.5, 0.85];
  let calls = 0;
  const result = await generateWithConfidence<string>({
    generate: async () => {
      const confidence = confidences[calls] ?? 0;
      calls += 1;
      return { output: `attempt-${calls}`, confidence };
    },
    threshold: 0.7,
    maxAttempts: 3,
  });

  assert.equal(calls, 3);
  assert.equal(result.status, "accepted");
  assert.equal(result.status === "accepted" && result.attempts, 3);
  assert.equal(result.status === "accepted" && result.output, "attempt-3");
});

test("returns low_confidence after exhausting maxAttempts without ever meeting the threshold", async () => {
  let calls = 0;
  const result = await generateWithConfidence<string>({
    generate: async () => {
      calls += 1;
      return { output: `attempt-${calls}`, confidence: 0.2 };
    },
    threshold: 0.7,
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, {
    status: "low_confidence",
    lastOutput: "attempt-2",
    lastConfidence: 0.2,
    attempts: 2,
  });
});

test("a separate score() function overrides the generator's self-reported confidence", async () => {
  const result = await generateWithConfidence<string>({
    generate: async () => ({ output: "answer", confidence: 0.99 }), // self-reports high, but...
    score: async () => ({ confidence: 0.1 }), // ...the judge disagrees
    threshold: 0.7,
    maxAttempts: 1,
  });

  assert.equal(result.status, "low_confidence");
  assert.equal(result.status === "low_confidence" && result.lastConfidence, 0.1);
});

test("previous attempts are passed back into generate() so a retry can incorporate feedback", async () => {
  const seenPreviousAttempts: number[] = [];
  await generateWithConfidence<string>({
    generate: async (context: GenerateContext<string>) => {
      seenPreviousAttempts.push(context.previousAttempts.length);
      const attempt = context.attempt;
      return { output: `attempt-${attempt}`, confidence: attempt >= 3 ? 0.9 : 0.1 };
    },
    threshold: 0.7,
    maxAttempts: 3,
  });

  assert.deepEqual(seenPreviousAttempts, [0, 1, 2]);
});

test("throws on a maxAttempts < 1 configuration instead of silently doing nothing", async () => {
  await assert.rejects(
    () =>
      generateWithConfidence<string>({
        generate: async () => ({ output: "x", confidence: 1 }),
        threshold: 0.5,
        maxAttempts: 0,
      }),
    /maxAttempts must be >= 1/,
  );
});
