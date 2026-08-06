import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { createLlmPhraseQuestion } from "./llm-question-phraser.js";

/**
 * Real integration tests against the live OpenAI API — same reasoning as
 * llm-extractor.live.test.ts: whether the model actually produces a
 * natural, meaning-preserving rephrasing (not just parses correctly) is
 * invisible to a fake-client unit test. This is the concrete fix for the
 * user's "should not ask static question everytime" complaint — proves the
 * static interviewHint strings genuinely get rephrased, not just that the
 * plumbing compiles. Skipped entirely when OPENAI_API_KEY isn't set.
 */
const hasLiveKey = Boolean(process.env.OPENAI_API_KEY);

test("live: rephrases a static interview hint into something that isn't the raw string, without losing its meaning", { skip: !hasLiveKey }, async () => {
  const phrase = createLlmPhraseQuestion(createOpenAiClient());
  const raw = "What's the name of your business?";
  const result = await phrase({ rawText: raw });

  assert.notEqual(result, raw, "expected a genuine rephrasing, not the static string echoed back");
  assert.match(result, /business/i);
  assert.ok(result.length > 0 && result.length < 300);
});

test("live: personalizes with the owner's name and business name when given as context", { skip: !hasLiveKey }, async () => {
  const phrase = createLlmPhraseQuestion(createOpenAiClient());
  const result = await phrase({
    rawText: "What are your business hours?",
    ownerName: "Priya",
    businessName: "Meadow Soaps",
  });

  assert.match(result, /hours/i);
  assert.match(result, /Priya|Meadow Soaps/i, `expected personalization to show up, got: "${result}"`);
});

test("live: does not invent a second question on top of the one it was given", { skip: !hasLiveKey }, async () => {
  const phrase = createLlmPhraseQuestion(createOpenAiClient());
  const result = await phrase({ rawText: "What's your name?" });
  const questionMarks = (result.match(/\?/g) ?? []).length;
  assert.ok(questionMarks <= 1, `expected at most one question, got: "${result}"`);
});
