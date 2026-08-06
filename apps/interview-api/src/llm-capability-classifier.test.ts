import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";
import { createLlmClassifyCapabilities } from "./llm-capability-classifier.js";

function stubSchema(key: PrimitiveSchema["key"], entryLabel: string): PrimitiveSchema {
  return {
    key,
    schemaVersion: 1,
    label: entryLabel,
    entryLabel,
    requiredFields: [],
    optionalFields: [],
    rendererContract: "",
    stateContract: [],
  };
}

const CANDIDATES: readonly PrimitiveSchema[] = [
  stubSchema("business_info", "Business Info"),
  stubSchema("catalogue", "Browse Products"),
  stubSchema("faq_support", "FAQs"),
  stubSchema("human_escalation", "Talk to a human"),
];

function fakeClient(content: string, capture?: { seenPrompt?: string }): OpenAiClient {
  return {
    chat: async (options) => {
      if (capture) capture.seenPrompt = options.messages[0]?.content;
      return { content };
    },
  };
}

test("returns the model's selected primitives when every key is a valid candidate", async () => {
  const client = fakeClient(
    JSON.stringify({ selectedPrimitives: ["catalogue", "faq_support"], confidence: 0.9, reason: "sells products, has FAQs" }),
  );
  const classify = createLlmClassifyCapabilities(client);
  const result = await classify("I sell handmade candles and get a lot of shipping questions", CANDIDATES);
  assert.deepEqual(result.selectedPrimitives, ["catalogue", "faq_support"]);
  assert.equal(result.confidence, 0.9);
});

test("drops any hallucinated key not in the candidate list rather than passing it through", async () => {
  const client = fakeClient(
    JSON.stringify({ selectedPrimitives: ["catalogue", "not_a_real_primitive"], confidence: 0.9, reason: "..." }),
  );
  const classify = createLlmClassifyCapabilities(client);
  const result = await classify("I sell things", CANDIDATES);
  assert.deepEqual(result.selectedPrimitives, ["catalogue"]);
});

test("treats malformed JSON as a zero-confidence, empty-selection result rather than throwing", async () => {
  const client = fakeClient("not json at all");
  const classify = createLlmClassifyCapabilities(client);
  const result = await classify("I sell handmade candles", CANDIDATES);
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.selectedPrimitives, []);
});

test("clamps an out-of-range confidence into [0, 1]", async () => {
  const client = fakeClient(JSON.stringify({ selectedPrimitives: ["catalogue"], confidence: 1.5, reason: "..." }));
  const classify = createLlmClassifyCapabilities(client);
  const result = await classify("I sell handmade candles", CANDIDATES);
  assert.equal(result.confidence, 1);
});

test("an empty selection is valid — not every business needs every capability", async () => {
  const client = fakeClient(JSON.stringify({ selectedPrimitives: [], confidence: 0.8, reason: "no clear signal beyond basics" }));
  const classify = createLlmClassifyCapabilities(client);
  const result = await classify("we're a small consultancy, not sure what we need yet", CANDIDATES);
  assert.deepEqual(result.selectedPrimitives, []);
  assert.equal(result.confidence, 0.8);
});

test("uses whatever getInstructions resolves to instead of the hardcoded default — proves admin overrides actually take effect", async () => {
  const capture: { seenPrompt?: string } = {};
  const client = fakeClient(JSON.stringify({ selectedPrimitives: [], confidence: 0.9, reason: "..." }), capture);
  const classify = createLlmClassifyCapabilities(client, async () => "Only ever pick booking, nothing else.");
  await classify("I sell handmade candles", CANDIDATES);
  assert.match(capture.seenPrompt ?? "", /Only ever pick booking, nothing else\./);
  // the candidate list and output-format instructions must still be present regardless of the override
  assert.match(capture.seenPrompt ?? "", /key: "catalogue"/);
  assert.match(capture.seenPrompt ?? "", /Respond with the list of matching keys/);
});
