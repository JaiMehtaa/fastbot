import { test } from "node:test";
import assert from "node:assert/strict";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { renderPersona, simulatePersonaTurn } from "./persona.js";

const groundTruth: DraftConfig = {
  draftSessionId: "persona-test",
  version: 1,
  lobKey: "retail_d2c",
  selectedPrimitives: ["business_info"],
  fieldValues: { business_info: { business_name: "Meadow Soaps" } },
};

test("renderPersona returns the rendered material and echoes the style", async () => {
  const profile = await renderPersona(groundTruth, "verbose", async () => "We make lovely handmade soaps.");
  assert.equal(profile.style, "verbose");
  assert.equal(profile.material, "We make lovely handmade soaps.");
  assert.equal(profile.groundTruth, groundTruth);
});

test("renderPersona throws when renderFn returns empty material", async () => {
  await assert.rejects(() => renderPersona(groundTruth, "clean", async () => "   "), /empty material/);
});

test("simulatePersonaTurn returns the simulated answer and receives full context", async () => {
  const profile = await renderPersona(groundTruth, "terse", async () => "Handmade soaps, lavender scent.");
  let receivedQuestion: string | undefined;
  let receivedHistoryLength: number | undefined;

  const answer = await simulatePersonaTurn(
    { profile, question: "What products do you sell?", history: [{ question: "Hi", answer: "Hello!" }] },
    async (context) => {
      receivedQuestion = context.question;
      receivedHistoryLength = context.history.length;
      return "We sell handmade soaps.";
    },
  );

  assert.equal(answer, "We sell handmade soaps.");
  assert.equal(receivedQuestion, "What products do you sell?");
  assert.equal(receivedHistoryLength, 1);
});

test("simulatePersonaTurn throws when simulateFn returns an empty answer", async () => {
  const profile = await renderPersona(groundTruth, "terse", async () => "Handmade soaps.");
  await assert.rejects(
    () => simulatePersonaTurn({ profile, question: "?", history: [] }, async () => ""),
    /empty answer/,
  );
});
