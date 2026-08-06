import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import { createLlmPhraseQuestion, DEFAULT_PHRASER_INSTRUCTIONS } from "./llm-question-phraser.js";

function fakeClient(capture: { seenPrompt?: string }, reply: string): OpenAiClient {
  return {
    chat: async (options) => {
      capture.seenPrompt = options.messages[0]?.content;
      return { content: reply };
    },
  };
}

test("uses the default instructions when no getInstructions override is given", async () => {
  const capture: { seenPrompt?: string } = {};
  const phrase = createLlmPhraseQuestion(fakeClient(capture, "Hi there!"));
  await phrase({ rawText: "What's your name?" });
  assert.match(capture.seenPrompt ?? "", new RegExp(DEFAULT_PHRASER_INSTRUCTIONS.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("uses whatever getInstructions resolves to instead of the hardcoded default — proves admin overrides actually take effect", async () => {
  const capture: { seenPrompt?: string } = {};
  const phrase = createLlmPhraseQuestion(fakeClient(capture, "Howdy partner!"), async () => "Talk like a cowboy.");
  const result = await phrase({ rawText: "What's your name?" });

  assert.match(capture.seenPrompt ?? "", /Talk like a cowboy\./);
  assert.ok(!capture.seenPrompt?.includes(DEFAULT_PHRASER_INSTRUCTIONS));
  assert.equal(result, "Howdy partner!");
});

test("falls back to the raw text if the LLM call throws", async () => {
  const throwingClient: OpenAiClient = { chat: async () => { throw new Error("network error"); } };
  const phrase = createLlmPhraseQuestion(throwingClient, async () => "anything");
  const result = await phrase({ rawText: "What's your name?" });
  assert.equal(result, "What's your name?");
});
