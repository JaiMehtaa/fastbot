import { test } from "node:test";
import assert from "node:assert/strict";
import type { MissingField } from "@whatsapp-bot-platform/shared-types";
import { heuristicExtractFields } from "./heuristic-extractor.js";

function missing(primitiveKey: MissingField["primitiveKey"], fieldKey: string): MissingField[] {
  return [{ primitiveKey, fieldKey, label: fieldKey, interviewHint: "?" }];
}

test("extracts a business_name from a trigger-phrase sentence", async () => {
  const result = await heuristicExtractFields({
    freeText: "We're called Meadow Soaps",
    missingFields: missing("business_info", "business_name"),
  });
  assert.equal(result[0]?.value, "Meadow Soaps");
  assert.ok(result[0]!.confidence >= 0.6);
});

test("extracts a business_name from a short standalone reply", async () => {
  const result = await heuristicExtractFields({
    freeText: "Meadow Soaps",
    missingFields: missing("business_info", "business_name"),
  });
  assert.equal(result[0]?.value, "Meadow Soaps");
});

test("extracts a description as the whole message when it's a text field", async () => {
  const result = await heuristicExtractFields({
    freeText: "We make natural handmade soaps using organic ingredients",
    missingFields: missing("business_info", "description"),
  });
  assert.equal(result[0]?.value, "We make natural handmade soaps using organic ingredients");
});

test("extracts weekly hours from a time range with a day word", async () => {
  const result = await heuristicExtractFields({
    freeText: "We're open 9am-6pm Monday to Friday",
    missingFields: missing("business_info", "hours"),
  });
  assert.equal(result.length, 1);
  const value = result[0]?.value as Record<string, string>;
  assert.match(Object.keys(value)[0] ?? "", /mon/i);
});

test("extracts an escalation_prompt from a plain sentence", async () => {
  const result = await heuristicExtractFields({
    freeText: "Someone from our team will get back to you soon",
    missingFields: missing("human_escalation", "escalation_prompt"),
  });
  assert.equal(result[0]?.value, "Someone from our team will get back to you soon");
});

test("extracts a name+link catalogue item from a URL plus surrounding text", async () => {
  const result = await heuristicExtractFields({
    freeText: "ShineZap Dishwash Bar, https://amazon.in/dp/shinezap",
    missingFields: missing("catalogue", "items"),
  });
  assert.equal(result.length, 1);
  const value = result[0]?.value as Array<{ name: string; link: string }>;
  assert.equal(value.length, 1);
  assert.equal(value[0]!.link, "https://amazon.in/dp/shinezap");
  assert.match(value[0]!.name, /ShineZap/);
});

test("extracts a catalogue item even when the name is phrased with a trigger word", async () => {
  const result = await heuristicExtractFields({
    freeText: "it's called CleanZap Detergent, link is https://amazon.in/dp/cleanzap",
    missingFields: missing("catalogue", "items"),
  });
  const value = result[0]?.value as Array<{ name: string; link: string }>;
  assert.match(value[0]!.name, /CleanZap/);
  assert.doesNotMatch(value[0]!.name, /^called/i);
});

test("does not extract a catalogue item when there's no URL in the message", async () => {
  const result = await heuristicExtractFields({
    freeText: "we sell handmade soap, lavender scent",
    missingFields: missing("catalogue", "items"),
  });
  assert.deepEqual(result, []);
});

test("extracts a labeled Q/A pair into a faqs array item", async () => {
  const result = await heuristicExtractFields({
    freeText: "Q: Are your soaps vegan? A: Yes, all of them.",
    missingFields: missing("faq_support", "faqs"),
  });
  assert.equal(result.length, 1);
  const value = result[0]?.value as Array<{ question: string; answer: string }>;
  assert.equal(value.length, 1);
  assert.match(value[0]!.question, /vegan/i);
  assert.match(value[0]!.answer, /yes/i);
});

test("extracts a faqs pair from an unlabeled question-then-answer message via the '?' fallback", async () => {
  const result = await heuristicExtractFields({
    freeText: "Are your soaps vegan? Yes, all of them are.",
    missingFields: missing("faq_support", "faqs"),
  });
  assert.equal(result.length, 1);
  const value = result[0]?.value as Array<{ question: string; answer: string }>;
  assert.match(value[0]!.question, /vegan\?$/i);
  assert.match(value[0]!.answer, /yes/i);
});

test("returns nothing when the target field can't be found in the schema", async () => {
  const result = await heuristicExtractFields({
    freeText: "anything",
    missingFields: [{ primitiveKey: "business_info", fieldKey: "not_a_real_field", label: "x", interviewHint: "?" }],
  });
  assert.deepEqual(result, []);
});

test("returns nothing when there are no missing fields", async () => {
  const result = await heuristicExtractFields({ freeText: "anything", missingFields: [] });
  assert.deepEqual(result, []);
});
