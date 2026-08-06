import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { createLlmExtractFields } from "./llm-extractor.js";

/**
 * Real integration tests against the live OpenAI API — skipped entirely
 * when OPENAI_API_KEY isn't set, same reasoning as apps/runtime's
 * db-repository.test.ts: prompt-quality bugs (the model interpreting an
 * instruction wrong) are invisible to fake-client unit tests, which only
 * exercise the parsing code around whatever canned response you hand them.
 * llm-extractor.test.ts is what everything else in this codebase tests
 * against without a live key.
 *
 * This file exists because a real multi-agent test round found the
 * business_info.hours prompt collapsing every multi-day answer down to a
 * single day, reproduced 3 separate times with 3 different phrasings —
 * verified fixed with ad-hoc `node -e` scripts at the time, which is not a
 * substitute for a real committed regression test that runs every time
 * this file changes.
 */
const hasLiveKey = Boolean(process.env.OPENAI_API_KEY);

const HOURS_FIELD = [{ primitiveKey: "business_info" as const, fieldKey: "hours", label: "hours", interviewHint: "What are your business hours?" }];

test(
  "live: 'open Monday to Saturday, 6am to 8pm' expands into one entry per day, not just monday",
  { skip: !hasLiveKey },
  async () => {
    const extract = createLlmExtractFields(createOpenAiClient());
    const result = await extract({ freeText: "open Monday to Saturday, 6am to 8pm", missingFields: HOURS_FIELD });
    const value = result[0]?.value as Record<string, string> | undefined;
    assert.ok(value, "expected an extraction");
    for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]) {
      assert.ok(value![day], `expected an entry for ${day}, got: ${JSON.stringify(value)}`);
    }
  },
);

test("live: 'Mon-Sat 10am-8pm, closed Sundays' expands the abbreviated range and keeps the closed day", { skip: !hasLiveKey }, async () => {
  const extract = createLlmExtractFields(createOpenAiClient());
  const result = await extract({ freeText: "Mon-Sat 10am-8pm, closed Sundays", missingFields: HOURS_FIELD });
  const value = result[0]?.value as Record<string, string> | undefined;
  assert.ok(value, "expected an extraction");
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]) {
    assert.match(value![day] ?? "", /10/, `expected ${day} to have the stated hours, got: ${JSON.stringify(value)}`);
  }
  assert.match(value!.sunday ?? "", /closed/i);
});

test("live: 'open everyday 9-9' expands to all seven days", { skip: !hasLiveKey }, async () => {
  const extract = createLlmExtractFields(createOpenAiClient());
  const result = await extract({ freeText: "open everyday 9-9", missingFields: HOURS_FIELD });
  const value = result[0]?.value as Record<string, string> | undefined;
  assert.ok(value, "expected an extraction");
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) {
    assert.ok(value![day], `expected an entry for ${day}, got: ${JSON.stringify(value)}`);
  }
});

test("live: business_name extracts correctly with no wrapper (regression for the bare-object parsing bug)", { skip: !hasLiveKey }, async () => {
  const extract = createLlmExtractFields(createOpenAiClient());
  const result = await extract({
    freeText: "Meadow Soaps",
    missingFields: [{ primitiveKey: "business_info", fieldKey: "business_name", label: "business_name", interviewHint: "What's the name of your business?" }],
  });
  assert.equal(result[0]?.value, "Meadow Soaps");
});
