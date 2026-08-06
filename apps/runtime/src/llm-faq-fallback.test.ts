import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import { createLlmFaqFallback } from "./llm-faq-fallback.js";

const FAQS = [{ question: "Are your soaps vegan?", answer: "Yes, all of them are." }];

function sequencedClient(responses: readonly string[]): { client: OpenAiClient; callCount: () => number } {
  let i = 0;
  return {
    client: {
      chat: async () => {
        const content = responses[Math.min(i, responses.length - 1)]!;
        i += 1;
        return { content };
      },
    },
    callCount: () => i,
  };
}

test("returns the answer when the judge scores it as fully grounded", async () => {
  const { client } = sequencedClient(["Yes, all our soaps are vegan.", JSON.stringify({ confidence: 0.95, reason: "matches FAQ #1 exactly" })]);
  const fallback = createLlmFaqFallback(client);
  const result = await fallback("are your soaps vegan?", FAQS);
  assert.deepEqual(result, { answer: "Yes, all our soaps are vegan." });
});

test("returns null (escalate) when the judge scores low on every retry", async () => {
  const { client, callCount } = sequencedClient([
    "Yes and we also ship internationally for free.",
    JSON.stringify({ confidence: 0.2, reason: "shipping claim not in FAQs" }),
    "Yes, vegan, and we donate 10% to charity.",
    JSON.stringify({ confidence: 0.1, reason: "charity claim not in FAQs" }),
  ]);
  const fallback = createLlmFaqFallback(client);
  const result = await fallback("are your soaps vegan?", FAQS);
  assert.equal(result, null);
  assert.equal(callCount(), 4); // 2 attempts, each an answer call + a judge call
});

test("escalates without ever calling the judge when the model reports the question isn't covered", async () => {
  const { client, callCount } = sequencedClient(["NOT_COVERED"]);
  const fallback = createLlmFaqFallback(client);
  const result = await fallback("do you ship to Canada?", FAQS);
  assert.equal(result, null);
  // 2 attempts (maxAttempts), each a bare answer-generation call — the judge is never
  // reached because score() short-circuits on NOT_COVERED before calling it
  assert.equal(callCount(), 2);
});

test("returns null and makes no calls when there are no FAQs to ground against", async () => {
  const { client, callCount } = sequencedClient(["should never be reached"]);
  const fallback = createLlmFaqFallback(client);
  const result = await fallback("anything", []);
  assert.equal(result, null);
  assert.equal(callCount(), 0);
});

test("treats a malformed judge response as zero confidence rather than throwing", async () => {
  const { client } = sequencedClient(["Yes, vegan.", "not json", "Yes, vegan.", "still not json"]);
  const fallback = createLlmFaqFallback(client);
  const result = await fallback("are your soaps vegan?", FAQS);
  assert.equal(result, null);
});

test("admin-provided guidance is included, but the FAQ-grounding safety constraint is always present regardless — proves it can't be overridden away", async () => {
  let answerPrompt: string | undefined;
  let calls = 0;
  const client: OpenAiClient = {
    chat: async (options) => {
      calls += 1;
      if (calls === 1) {
        answerPrompt = options.messages[0]?.content;
        return { content: "Yes, vegan." };
      }
      return { content: JSON.stringify({ confidence: 0.95 }) };
    },
  };
  const fallback = createLlmFaqFallback(client, { getGuidance: async () => "Always answer in a cheerful tone." });
  await fallback("are your soaps vegan?", FAQS);

  assert.match(answerPrompt ?? "", /Always answer in a cheerful tone\./);
  assert.match(answerPrompt ?? "", /Answer using ONLY the information in the FAQ list below/);
  assert.match(answerPrompt ?? "", /NOT_COVERED/);
});
