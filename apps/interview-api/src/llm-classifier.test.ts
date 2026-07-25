import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenRouterClient } from "@whatsapp-bot-platform/eval";
import type { LobRecipe } from "@whatsapp-bot-platform/shared-types";
import { createLlmClassifyLob } from "./llm-classifier.js";

const CANDIDATES: readonly LobRecipe[] = [
  { key: "retail_d2c", label: "Retail / D2C", defaultPrimitives: ["business_info"], classificationExamples: ["I sell soap"] },
  { key: "minimal_support", label: "General", defaultPrimitives: ["business_info"], classificationExamples: [] },
];

function fakeClient(content: string): OpenRouterClient {
  return { chat: async () => ({ content }) };
}

test("returns the model's classification when it names a valid candidate key", async () => {
  const client = fakeClient(JSON.stringify({ lobKey: "retail_d2c", confidence: 0.92, reason: "Sells physical goods online" }));
  const classify = createLlmClassifyLob(client);
  const result = await classify("I sell handmade candles", CANDIDATES);
  assert.equal(result.lobKey, "retail_d2c");
  assert.equal(result.confidence, 0.92);
});

test("rejects a lobKey the model hallucinated that isn't in the candidate list", async () => {
  const client = fakeClient(JSON.stringify({ lobKey: "not_a_real_lob", confidence: 0.9, reason: "..." }));
  const classify = createLlmClassifyLob(client);
  const result = await classify("I sell handmade candles", CANDIDATES);
  assert.equal(result.confidence, 0);
});

test("treats malformed JSON as a zero-confidence result rather than throwing", async () => {
  const client = fakeClient("not json at all");
  const classify = createLlmClassifyLob(client);
  const result = await classify("I sell handmade candles", CANDIDATES);
  assert.equal(result.confidence, 0);
});

test("clamps an out-of-range confidence into [0, 1]", async () => {
  const client = fakeClient(JSON.stringify({ lobKey: "retail_d2c", confidence: 1.5, reason: "..." }));
  const classify = createLlmClassifyLob(client);
  const result = await classify("I sell handmade candles", CANDIDATES);
  assert.equal(result.confidence, 1);
});
