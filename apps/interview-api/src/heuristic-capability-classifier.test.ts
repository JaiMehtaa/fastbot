import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";
import { heuristicClassifyCapabilities } from "./heuristic-capability-classifier.js";

function stubSchema(key: PrimitiveSchema["key"]): PrimitiveSchema {
  return {
    key,
    schemaVersion: 1,
    label: key,
    entryLabel: key,
    requiredFields: [],
    optionalFields: [],
    rendererContract: "",
    stateContract: [],
  };
}

const CANDIDATES: readonly PrimitiveSchema[] = [
  stubSchema("catalogue"),
  stubSchema("faq_support"),
  stubSchema("booking"),
  stubSchema("lead_capture"),
];

test("matches catalogue from product-selling language", async () => {
  const result = await heuristicClassifyCapabilities("I sell handmade soaps and skincare products online", CANDIDATES);
  assert.ok(result.selectedPrimitives.includes("catalogue"));
  assert.ok(result.confidence >= 0.6);
});

test("matches booking from appointment language — proves a new primitive is selectable without touching interview-session.ts", async () => {
  const result = await heuristicClassifyCapabilities("customers need to book an appointment for a haircut", CANDIDATES);
  assert.ok(result.selectedPrimitives.includes("booking"));
});

test("matches multiple primitives at once when the description gives signal for both", async () => {
  const result = await heuristicClassifyCapabilities(
    "we sell products online and also take appointments for fittings",
    CANDIDATES,
  );
  assert.ok(result.selectedPrimitives.includes("catalogue"));
  assert.ok(result.selectedPrimitives.includes("booking"));
});

test("falls back to an empty, low-confidence selection for genuinely vague text", async () => {
  const result = await heuristicClassifyCapabilities("we do stuff", CANDIDATES);
  assert.deepEqual(result.selectedPrimitives, []);
  assert.ok(result.confidence < 0.6);
});
