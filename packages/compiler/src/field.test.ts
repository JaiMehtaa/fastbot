import { test } from "node:test";
import assert from "node:assert/strict";
import type { FieldDefinition } from "@whatsapp-bot-platform/shared-types";
import { isEmptyValue, validateField } from "./field.js";

test("isEmptyValue treats undefined, null, blank string, and empty array as empty", () => {
  assert.equal(isEmptyValue(undefined), true);
  assert.equal(isEmptyValue(null), true);
  assert.equal(isEmptyValue("   "), true);
  assert.equal(isEmptyValue([]), true);
  assert.equal(isEmptyValue("hello"), false);
  assert.equal(isEmptyValue(0), false);
  assert.equal(isEmptyValue(false), false);
});

test("validateField skips empty values (required-ness is the caller's job)", () => {
  const field: FieldDefinition = {
    key: "business_name",
    label: "Business name",
    type: "string",
    required: true,
    interviewHint: "?",
  };
  assert.deepEqual(validateField(field, undefined), []);
});

test("validateField rejects wrong type for a string field", () => {
  const field: FieldDefinition = {
    key: "business_name",
    label: "Business name",
    type: "string",
    required: true,
    interviewHint: "?",
  };
  const issues = validateField(field, 12345);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.severity, "error");
});

test("validateField rejects an invalid URL", () => {
  const field: FieldDefinition = {
    key: "website",
    label: "Website",
    type: "url",
    required: false,
    interviewHint: "?",
  };
  assert.equal(validateField(field, "not-a-url").length, 1);
  assert.equal(validateField(field, "https://zaphomecare.com").length, 0);
});

test("validateField enforces minItems on array fields", () => {
  const field: FieldDefinition = {
    key: "items",
    label: "Items",
    type: "array",
    required: true,
    minItems: 2,
    interviewHint: "?",
  };
  const issues = validateField(field, [{ name: "one" }]);
  assert.equal(issues.length, 1);
  assert.match(issues[0]?.message ?? "", /at least 2/);
});

test("validateField recurses into array item fields and flags missing required sub-fields", () => {
  const field: FieldDefinition = {
    key: "items",
    label: "Items",
    type: "array",
    required: true,
    interviewHint: "?",
    itemFields: [
      { key: "name", label: "Name", type: "string", required: true, interviewHint: "?" },
      { key: "link", label: "Link", type: "url", required: true, interviewHint: "?" },
    ],
  };
  const issues = validateField(field, [{ name: "ShineZap Bar" }]);
  assert.equal(issues.length, 1);
  assert.match(issues[0]?.fieldPath ?? "", /items\[0\]\.link/);
});
