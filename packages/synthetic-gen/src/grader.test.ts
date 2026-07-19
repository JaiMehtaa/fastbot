import { test } from "node:test";
import assert from "node:assert/strict";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { defaultTextComparator, gradeDraftConfig } from "./grader.js";

function baseDraft(fieldValues: DraftConfig["fieldValues"]): DraftConfig {
  return {
    draftSessionId: "grader-test",
    version: 1,
    lobKey: "retail_d2c",
    selectedPrimitives: ["business_info", "catalogue"],
    fieldValues,
  };
}

test("defaultTextComparator matches reworded text with sufficient token overlap", () => {
  assert.equal(
    defaultTextComparator("We ship pan-India within 5 days", "We ship across India in 5 days"),
    true,
  );
});

test("defaultTextComparator rejects text with little to no overlap", () => {
  assert.equal(defaultTextComparator("We ship pan-India", "Our store closes at 9pm on weekends"), false);
});

test("gradeDraftConfig scores exact-match structured fields as match", () => {
  const groundTruth = baseDraft({
    business_info: { business_name: "Zap Home Care", hours: { mon_fri: "9:00-19:00" } },
  });
  const candidate = baseDraft({
    business_info: { business_name: "Zap Home Care", hours: { mon_fri: "9:00-19:00" } },
  });

  const report = gradeDraftConfig(groundTruth, candidate);
  assert.equal(report.score, 1);
  assert.ok(report.fieldResults.every((r) => r.status === "match"));
});

test("gradeDraftConfig flags a differing structured field as mismatch", () => {
  const groundTruth = baseDraft({ business_info: { business_name: "Zap Home Care" } });
  const candidate = baseDraft({ business_info: { business_name: "Zap Homecare Co." } });

  const report = gradeDraftConfig(groundTruth, candidate);
  assert.equal(report.fieldResults[0]?.status, "mismatch");
  assert.equal(report.score, 0);
});

test("gradeDraftConfig flags a field the candidate never provided as missing", () => {
  const groundTruth = baseDraft({ business_info: { business_name: "Zap Home Care" } });
  const candidate = baseDraft({ business_info: {} });

  const report = gradeDraftConfig(groundTruth, candidate);
  assert.equal(report.fieldResults[0]?.status, "missing");
});

test("gradeDraftConfig skips fields the ground truth itself doesn't specify", () => {
  const groundTruth = baseDraft({ business_info: { business_name: "Zap Home Care" } });
  const candidate = baseDraft({ business_info: { business_name: "Zap Home Care", website: "https://zaphomecare.com" } });

  const report = gradeDraftConfig(groundTruth, candidate);
  assert.ok(!report.fieldResults.some((r) => r.fieldKey === "website"));
});

test("gradeDraftConfig uses fuzzy matching for text fields, not exact equality", () => {
  const groundTruth = baseDraft({
    business_info: { business_name: "Zap Home Care", description: "We make dishwash and laundry care products." },
  });
  const candidate = baseDraft({
    business_info: { business_name: "Zap Home Care", description: "We make laundry and dishwash care products." },
  });

  const report = gradeDraftConfig(groundTruth, candidate);
  const descriptionResult = report.fieldResults.find((r) => r.fieldKey === "description");
  assert.equal(descriptionResult?.status, "match");
});

test("gradeDraftConfig returns score 1 when there is nothing to grade", () => {
  const groundTruth = baseDraft({});
  const candidate = baseDraft({});
  const report = gradeDraftConfig(groundTruth, candidate);
  assert.equal(report.score, 1);
  assert.equal(report.totalCount, 0);
});
