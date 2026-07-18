import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";
import { checkRegistryConsistency, listPrimitives } from "./registry.js";

test("the live primitive registry has no state-name collisions", () => {
  assert.deepEqual(checkRegistryConsistency(), []);
});

test("the live registry is non-empty (sanity check against an accidentally-emptied registry)", () => {
  assert.ok(listPrimitives().length >= 4);
});

test("checkRegistryConsistency catches a deliberately colliding pair", () => {
  const a: PrimitiveSchema = {
    key: "lead_capture",
    schemaVersion: 1,
    label: "Lead Capture (fixture)",
    entryLabel: "Get in touch",
    requiredFields: [],
    optionalFields: [],
    rendererContract: "fixture",
    stateContract: ["SHARED_STATE"],
  };
  const b: PrimitiveSchema = {
    key: "order_management",
    schemaVersion: 1,
    label: "Order Management (fixture)",
    entryLabel: "Track order",
    requiredFields: [],
    optionalFields: [],
    rendererContract: "fixture",
    stateContract: ["SHARED_STATE"],
  };

  const issues = checkRegistryConsistency([a, b]);

  assert.equal(issues.length, 1);
  assert.match(issues[0]?.message ?? "", /"lead_capture" and "order_management"/);
});

test("checkRegistryConsistency does not flag the same primitive repeating its own state", () => {
  const a: PrimitiveSchema = {
    key: "lead_capture",
    schemaVersion: 1,
    label: "Lead Capture (fixture)",
    entryLabel: "Get in touch",
    requiredFields: [],
    optionalFields: [],
    rendererContract: "fixture",
    stateContract: ["SAME_STATE", "SAME_STATE"],
  };

  assert.deepEqual(checkRegistryConsistency([a]), []);
});
