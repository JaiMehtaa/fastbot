import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenAiClient } from "@whatsapp-bot-platform/eval";
import type { MissingField } from "@whatsapp-bot-platform/shared-types";
import { createLlmExtractFields } from "./llm-extractor.js";

function missing(primitiveKey: MissingField["primitiveKey"], fieldKey: string): MissingField[] {
  return [{ primitiveKey, fieldKey, label: fieldKey, interviewHint: "?" }];
}

function fakeClient(content: string, capture?: { seenPrompt?: string }): OpenAiClient {
  return {
    chat: async (options) => {
      if (capture) capture.seenPrompt = options.messages[0]?.content;
      return { content };
    },
  };
}

test("extracts multiple fields answered in a single message", async () => {
  const client = fakeClient(
    JSON.stringify([
      { primitiveKey: "business_info", fieldKey: "business_name", value: "Zap Home Care", confidence: 0.95, reason: "named directly" },
      { primitiveKey: "business_info", fieldKey: "hours", value: { daily: "9am-7pm" }, confidence: 0.85, reason: "time range with 'daily'" },
    ]),
  );
  const extract = createLlmExtractFields(client);
  const result = await extract({
    freeText: "we're Zap Home Care, open 9-7 daily",
    missingFields: [...missing("business_info", "business_name"), ...missing("business_info", "hours")],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0]?.value, "Zap Home Care");
  assert.deepEqual(result[1]?.value, { daily: "9am-7pm" });
});

test("drops an extraction for a field that wasn't actually asked about", async () => {
  const client = fakeClient(
    JSON.stringify([{ primitiveKey: "business_info", fieldKey: "not_requested", value: "x", confidence: 0.9, reason: "..." }]),
  );
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "anything", missingFields: missing("business_info", "business_name") });
  assert.deepEqual(result, []);
});

test("drops an extraction whose value doesn't match the field's declared type", async () => {
  const client = fakeClient(
    JSON.stringify([{ primitiveKey: "human_escalation", fieldKey: "escalation_prompt", value: 12345, confidence: 0.9, reason: "..." }]),
  );
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "anything", missingFields: missing("human_escalation", "escalation_prompt") });
  assert.deepEqual(result, []);
});

test("returns nothing when the message doesn't address the requested field", async () => {
  const client = fakeClient("[]");
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "just saying hi", missingFields: missing("business_info", "business_name") });
  assert.deepEqual(result, []);
});

test("accepts a top-level object wrapping the array, and strips a markdown code fence", async () => {
  const client = fakeClient(
    "```json\n" +
      JSON.stringify({
        extractions: [{ primitiveKey: "business_info", fieldKey: "business_name", value: "Meadow Soaps", confidence: 0.9, reason: "..." }],
      }) +
      "\n```",
  );
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "We're called Meadow Soaps", missingFields: missing("business_info", "business_name") });
  assert.equal(result[0]?.value, "Meadow Soaps");
});

test("accepts a single bare extraction object with no array wrapper at all", async () => {
  // Regression test: discovered live against real gpt-4o-mini, not caught by any
  // prior test — when only one field is being asked about, response_format:
  // json_object's top-level-object requirement led the model to return the
  // single extraction directly (no "extractions" wrapper, not an array),
  // which silently extracted nothing every single turn.
  const client = fakeClient(
    JSON.stringify({ primitiveKey: "business_info", fieldKey: "business_name", value: "Meadow Soaps", confidence: 1, reason: "..." }),
  );
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "Meadow Soaps", missingFields: missing("business_info", "business_name") });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.value, "Meadow Soaps");
});

test("treats a null JSON value as no extractions rather than throwing", async () => {
  const client = fakeClient("null");
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "anything", missingFields: missing("business_info", "business_name") });
  assert.deepEqual(result, []);
});

test("treats malformed JSON as no extractions rather than throwing", async () => {
  const client = fakeClient("not json");
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "anything", missingFields: missing("business_info", "business_name") });
  assert.deepEqual(result, []);
});

test("validates a catalogue array item against its required item fields", async () => {
  const client = fakeClient(
    JSON.stringify([
      {
        primitiveKey: "catalogue",
        fieldKey: "items",
        value: [{ name: "Lavender Bar", link: "https://example.com/lavender" }],
        confidence: 0.8,
        reason: "...",
      },
    ]),
  );
  const extract = createLlmExtractFields(client);
  const result = await extract({ freeText: "Lavender Bar, https://example.com/lavender", missingFields: missing("catalogue", "items") });
  assert.equal(result.length, 1);
});

test("uses whatever getInstructions resolves to instead of the hardcoded default — proves admin overrides actually take effect", async () => {
  const capture: { seenPrompt?: string } = {};
  const client = fakeClient(JSON.stringify([]), capture);
  const extract = createLlmExtractFields(client, async () => "Only extract nicknames, ignore everything else.");
  await extract({ freeText: "we're Zap Home Care", missingFields: missing("business_info", "business_name") });
  assert.match(capture.seenPrompt ?? "", /Only extract nicknames, ignore everything else\./);
  // the field description and JSON output-format instructions must still be present regardless of the override
  assert.match(capture.seenPrompt ?? "", /"extractions"/);
});
