import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDraft } from "@whatsapp-bot-platform/compiler";
import { curatedScenarios } from "./scenarios.js";

test("every curated scenario has a unique key", () => {
  const keys = curatedScenarios.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

for (const scenario of curatedScenarios) {
  test(`curated scenario "${scenario.key}" ground truth validates cleanly`, () => {
    const result = validateDraft(scenario.groundTruth);
    assert.equal(
      result.valid,
      true,
      `expected "${scenario.key}" ground truth to validate; missing=${JSON.stringify(result.missingRequiredFields)} issues=${JSON.stringify(result.issues)}`,
    );
  });

  test(`curated scenario "${scenario.key}" has non-empty material and expectedBehavior`, () => {
    assert.ok(scenario.material.trim().length > 0);
    assert.ok(scenario.expectedBehavior.trim().length > 0);
  });
}
