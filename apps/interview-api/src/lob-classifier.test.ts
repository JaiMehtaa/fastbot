import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLob, type ClassifyLobFn } from "./lob-classifier.js";

test("classifyLob accepts a confident classification", async () => {
  const classifyFn: ClassifyLobFn = async () => ({ lobKey: "retail_d2c", confidence: 0.9 });
  const result = await classifyLob("we sell handmade soaps online", classifyFn);
  assert.deepEqual(result, { status: "classified", lobKey: "retail_d2c" });
});

test("classifyLob reports low_confidence instead of accepting a shaky guess", async () => {
  const classifyFn: ClassifyLobFn = async () => ({ lobKey: "retail_d2c", confidence: 0.2, reason: "too vague" });
  const result = await classifyLob("we do stuff", classifyFn);
  assert.deepEqual(result, { status: "low_confidence", reason: "too vague" });
});

test("classifyLob passes the real lob_recipes candidates to the injected classifier", async () => {
  let seenCandidateKeys: string[] = [];
  const classifyFn: ClassifyLobFn = async (_text, candidates) => {
    seenCandidateKeys = candidates.map((c) => c.key);
    return { lobKey: "retail_d2c", confidence: 0.9 };
  };
  await classifyLob("anything", classifyFn);
  assert.ok(seenCandidateKeys.includes("retail_d2c"));
  assert.ok(seenCandidateKeys.includes("minimal_support"));
});

test("classifyLob does not retry in-loop — it calls the classifier exactly once per turn", async () => {
  let calls = 0;
  const classifyFn: ClassifyLobFn = async () => {
    calls += 1;
    return { lobKey: "retail_d2c", confidence: 0.1 };
  };
  await classifyLob("hi", classifyFn);
  assert.equal(calls, 1);
});
