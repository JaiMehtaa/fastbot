import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { createLlmExtractOwnerInfo } from "./llm-owner-info-extractor.js";

/**
 * Real integration tests against the live OpenAI API — same reasoning as
 * llm-extractor.live.test.ts: whether the model actually pulls a name and
 * contact out of natural phrasing (not just parses a canned response) is a
 * prompt-quality question invisible to a fake-client unit test.
 */
const hasLiveKey = Boolean(process.env.OPENAI_API_KEY);

test("live: extracts both name and contact from one natural sentence", { skip: !hasLiveKey }, async () => {
  const extract = createLlmExtractOwnerInfo(createOpenAiClient());
  const result = await extract("Hey it's Priya here, best way to reach me is priya@meadowsoaps.example");

  assert.ok(result.name, "expected a name extraction");
  assert.match(result.name!.value, /priya/i);
  assert.ok(result.name!.confidence >= 0.6);

  assert.ok(result.contact, "expected a contact extraction");
  assert.match(result.contact!.value, /priya@meadowsoaps\.example/i);
  assert.ok(result.contact!.confidence >= 0.6);
});

test("live: extracts only the name when no contact info is given, without inventing one", { skip: !hasLiveKey }, async () => {
  const extract = createLlmExtractOwnerInfo(createOpenAiClient());
  const result = await extract("I'm Arjun");

  assert.ok(result.name);
  assert.match(result.name!.value, /arjun/i);
  assert.equal(result.contact, null);
});

test("live: a phone number given as contact is extracted, not mistaken for a name", { skip: !hasLiveKey }, async () => {
  const extract = createLlmExtractOwnerInfo(createOpenAiClient());
  const result = await extract("You can call me on 9876543210");

  assert.ok(result.contact, "expected a contact extraction");
  assert.match(result.contact!.value, /9876543210/);
});
