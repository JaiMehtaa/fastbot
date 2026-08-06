import { test } from "node:test";
import assert from "node:assert/strict";
import { listPrimitives } from "@whatsapp-bot-platform/schema";
import { BASELINE_PRIMITIVES, classifyCapabilities, type ClassifyCapabilitiesFn } from "./capability-classifier.js";

test("classifyCapabilities accepts a confident classification and merges in the baseline primitives", async () => {
  const classifyFn: ClassifyCapabilitiesFn = async () => ({ selectedPrimitives: ["catalogue"], confidence: 0.9 });
  const result = await classifyCapabilities("we sell handmade soaps online", listPrimitives(), classifyFn);
  assert.equal(result.status, "classified");
  if (result.status !== "classified") throw new Error("unreachable");
  assert.ok(result.selectedPrimitives.includes("catalogue"));
  for (const baseline of BASELINE_PRIMITIVES) {
    assert.ok(result.selectedPrimitives.includes(baseline), `expected baseline "${baseline}" to be included`);
  }
});

test("classifyCapabilities reports low_confidence instead of accepting a shaky guess", async () => {
  const classifyFn: ClassifyCapabilitiesFn = async () => ({
    selectedPrimitives: ["catalogue"],
    confidence: 0.2,
    reason: "too vague",
  });
  const result = await classifyCapabilities("we do stuff", listPrimitives(), classifyFn);
  assert.deepEqual(result, { status: "low_confidence", reason: "too vague" });
});

test("classifyCapabilities does not retry in-loop — it calls the classifier exactly once per turn", async () => {
  let calls = 0;
  const classifyFn: ClassifyCapabilitiesFn = async () => {
    calls += 1;
    return { selectedPrimitives: [], confidence: 0.1 };
  };
  await classifyCapabilities("hi", listPrimitives(), classifyFn);
  assert.equal(calls, 1);
});

test("a confident but empty selection still gets the baseline primitives, never a fully empty draft", async () => {
  const classifyFn: ClassifyCapabilitiesFn = async () => ({ selectedPrimitives: [], confidence: 0.9 });
  const result = await classifyCapabilities("we're a solo consultant, keep it simple", listPrimitives(), classifyFn);
  assert.equal(result.status, "classified");
  if (result.status !== "classified") throw new Error("unreachable");
  assert.deepEqual([...result.selectedPrimitives].sort(), [...BASELINE_PRIMITIVES].sort());
});

test("classifyCapabilities passes the live registry's primitives as candidates to the injected classifier", async () => {
  let seenKeys: string[] = [];
  const classifyFn: ClassifyCapabilitiesFn = async (_text, candidates) => {
    seenKeys = candidates.map((c) => c.key);
    return { selectedPrimitives: [], confidence: 0.9 };
  };
  await classifyCapabilities("anything", listPrimitives(), classifyFn);
  assert.ok(seenKeys.includes("catalogue"));
  assert.ok(seenKeys.includes("faq_support"));
});
