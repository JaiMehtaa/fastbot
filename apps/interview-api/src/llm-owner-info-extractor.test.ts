import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import { createLlmExtractOwnerInfo } from "./llm-owner-info-extractor.js";

function fakeClient(content: string, capture?: { seenPrompt?: string }): OpenAiClient {
  return {
    chat: async (options) => {
      if (capture) capture.seenPrompt = options.messages[0]?.content;
      return { content };
    },
  };
}

test("returns name and contact with their confidences when both are present", async () => {
  const client = fakeClient(JSON.stringify({ name: "Jai", nameConfidence: 0.9, contact: "jai@example.com", contactConfidence: 0.85 }));
  const extract = createLlmExtractOwnerInfo(client);
  const result = await extract("I'm Jai, reach me at jai@example.com");
  assert.deepEqual(result.name, { value: "Jai", confidence: 0.9 });
  assert.deepEqual(result.contact, { value: "jai@example.com", confidence: 0.85 });
});

test("treats a null field as no extraction for that field", async () => {
  const client = fakeClient(JSON.stringify({ name: "Jai", nameConfidence: 0.9, contact: null, contactConfidence: 0 }));
  const extract = createLlmExtractOwnerInfo(client);
  const result = await extract("I'm Jai");
  assert.deepEqual(result.name, { value: "Jai", confidence: 0.9 });
  assert.equal(result.contact, null);
});

test("treats malformed JSON as no extractions rather than throwing", async () => {
  const client = fakeClient("not json");
  const extract = createLlmExtractOwnerInfo(client);
  const result = await extract("I'm Jai");
  assert.equal(result.name, null);
  assert.equal(result.contact, null);
});

test("uses whatever getInstructions resolves to instead of the hardcoded default — proves admin overrides actually take effect", async () => {
  const capture: { seenPrompt?: string } = {};
  const client = fakeClient(JSON.stringify({ name: null, nameConfidence: 0, contact: null, contactConfidence: 0 }), capture);
  const extract = createLlmExtractOwnerInfo(client, async () => "Only extract nicknames, never full names.");
  await extract("I'm Jai");
  assert.match(capture.seenPrompt ?? "", /Only extract nicknames, never full names\./);
  // the field-by-field extraction spec must still be present regardless of the override
  assert.match(capture.seenPrompt ?? "", /nameConfidence: 0 to 1/);
});
