import { test } from "node:test";
import assert from "node:assert/strict";
import { lobRecipes } from "@whatsapp-bot-platform/schema";
import { heuristicClassifyLob } from "./heuristic-classifier.js";

test("heuristicClassifyLob confidently matches a description close to a real classification example", async () => {
  const result = await heuristicClassifyLob("I sell handmade soaps and skincare products online", lobRecipes);
  assert.equal(result.lobKey, "retail_d2c");
  assert.ok(result.confidence >= 0.6, `expected confidence >= 0.6, got ${result.confidence}`);
});

test("heuristicClassifyLob falls back to minimal_support for a genuinely vague description", async () => {
  const result = await heuristicClassifyLob("we do stuff", lobRecipes);
  assert.equal(result.lobKey, "minimal_support");
  assert.ok(result.confidence < 0.6);
});

test("heuristicClassifyLob matches a D2C brand description even with different wording than the examples", async () => {
  const result = await heuristicClassifyLob("we're a small brand selling home care and cleaning products", lobRecipes);
  assert.equal(result.lobKey, "retail_d2c");
});
