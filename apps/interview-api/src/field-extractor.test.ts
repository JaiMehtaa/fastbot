import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFields, type ExtractFieldsFn } from "./field-extractor.js";

test("extractFields commits high-confidence extractions", async () => {
  const extractFn: ExtractFieldsFn = async () => [
    { primitiveKey: "business_info", fieldKey: "business_name", value: "Zap Home Care", confidence: 0.95 },
  ];
  const result = await extractFields("we're Zap Home Care", [], extractFn);
  assert.equal(result.committed.length, 1);
  assert.equal(result.lowConfidence.length, 0);
  assert.equal(result.committed[0]?.value, "Zap Home Care");
});

test("extractFields does not commit a low-confidence extraction", async () => {
  const extractFn: ExtractFieldsFn = async () => [
    { primitiveKey: "business_info", fieldKey: "hours", value: { mon_fri: "maybe 9-6?" }, confidence: 0.3 },
  ];
  const result = await extractFields("we're open sometime in the morning I think", [], extractFn);
  assert.equal(result.committed.length, 0);
  assert.equal(result.lowConfidence.length, 1);
});

test("extractFields handles multiple fields answered in a single message independently", async () => {
  const extractFn: ExtractFieldsFn = async () => [
    { primitiveKey: "business_info", fieldKey: "business_name", value: "Zap Home Care", confidence: 0.9 },
    { primitiveKey: "business_info", fieldKey: "hours", value: { mon_fri: "unclear" }, confidence: 0.2 },
  ];
  const result = await extractFields("we're Zap Home Care, open sometimes", [], extractFn);
  assert.equal(result.committed.length, 1);
  assert.equal(result.lowConfidence.length, 1);
  assert.equal(result.committed[0]?.fieldKey, "business_name");
  assert.equal(result.lowConfidence[0]?.fieldKey, "hours");
});

test("extractFields passes the current missing-fields list to the injected extractor", async () => {
  let seenMissingKeys: string[] = [];
  const extractFn: ExtractFieldsFn = async ({ missingFields }) => {
    seenMissingKeys = missingFields.map((f) => f.fieldKey);
    return [];
  };
  await extractFields("some text", [{ primitiveKey: "business_info", fieldKey: "hours", label: "Hours", interviewHint: "?" }], extractFn);
  assert.deepEqual(seenMissingKeys, ["hours"]);
});
