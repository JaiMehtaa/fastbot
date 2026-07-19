import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrimitiveFieldValues } from "@whatsapp-bot-platform/shared-types";
import type { ClassifyLobFn } from "./lob-classifier.js";
import type { ExtractFieldsFn, FieldExtraction } from "./field-extractor.js";
import { createInitialState, processTurn, type InterviewSessionState } from "./interview-session.js";

const confidentRetail: ClassifyLobFn = async () => ({ lobKey: "retail_d2c", confidence: 0.9 });
const alwaysAmbiguous: ClassifyLobFn = async () => ({ lobKey: "retail_d2c", confidence: 0.1, reason: "too vague" });
const noExtractions: ExtractFieldsFn = async () => [];

test("first turn with a confident classification locks the LOB and asks the first missing field", async () => {
  const state = createInitialState("draft-1");
  const result = await processTurn(state, "I sell handmade soaps online", {
    classifyFn: confidentRetail,
    extractFn: noExtractions,
  });

  assert.equal(result.state.lobKey, "retail_d2c");
  assert.equal(result.done, false);
  assert.ok(result.responseText.length > 0);
});

test("an ambiguous first message asks one clarifying question without locking a LOB yet", async () => {
  const state = createInitialState("draft-1");
  const result = await processTurn(state, "we do stuff", { classifyFn: alwaysAmbiguous, extractFn: noExtractions });

  assert.equal(result.state.lobKey, null);
  assert.equal(result.state.lobAmbiguityAsked, true);
  assert.match(result.responseText, /tell me a bit more/);
});

test("a second consecutive ambiguous classification falls back to minimal_support instead of looping forever", async () => {
  let state = createInitialState("draft-1");
  const first = await processTurn(state, "we do stuff", { classifyFn: alwaysAmbiguous, extractFn: noExtractions });
  state = first.state;

  const second = await processTurn(state, "still vague", { classifyFn: alwaysAmbiguous, extractFn: noExtractions });
  assert.equal(second.state.lobKey, "minimal_support");
});

test("extraction commits a field and validateDraft-driven flow asks for the next missing field", async () => {
  let state: InterviewSessionState = { ...createInitialState("draft-1"), lobKey: null };
  const locked = await processTurn(state, "I run a soap shop", {
    classifyFn: confidentRetail,
    extractFn: noExtractions,
  });
  state = locked.state;
  assert.equal(state.selectedPrimitives.includes("business_info"), true);

  const extractFn: ExtractFieldsFn = async () => [
    { primitiveKey: "business_info", fieldKey: "business_name", value: "Meadow Soaps", confidence: 0.9 },
  ];
  const afterExtraction = await processTurn(state, "We're called Meadow Soaps", {
    classifyFn: confidentRetail,
    extractFn,
  });

  assert.equal(afterExtraction.state.fieldValues.business_info?.business_name, "Meadow Soaps");
  // still missing other required fields (description, hours) -> not done yet
  assert.equal(afterExtraction.done, false);
});

test("a low-confidence extraction is not committed — the field stays missing and gets asked again", async () => {
  let state: InterviewSessionState = createInitialState("draft-1");
  const locked = await processTurn(state, "I run a soap shop", {
    classifyFn: confidentRetail,
    extractFn: noExtractions,
  });
  state = locked.state;

  const lowConfidenceExtractFn: ExtractFieldsFn = async () => [
    { primitiveKey: "business_info", fieldKey: "business_name", value: "maybe Meadow?", confidence: 0.2 },
  ];
  const result = await processTurn(state, "uh, something with soap I think", {
    classifyFn: confidentRetail,
    extractFn: lowConfidenceExtractFn,
  });

  assert.equal(result.state.fieldValues.business_info?.business_name, undefined);
});

test("resumability: a session resumed from stored field_values (no conversation history) asks for the correct next field", async () => {
  const partiallyFilledState: InterviewSessionState = {
    draftSessionId: "draft-1",
    lobKey: "minimal_support",
    lobAmbiguityAsked: false,
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: { business_name: "Meadow Soaps", description: "Handmade soaps.", hours: { mon_fri: "9-18" } },
    },
    confirmed: false,
  };

  const result = await processTurn(partiallyFilledState, "hey I'm back", {
    classifyFn: confidentRetail,
    extractFn: noExtractions,
  });

  // business_info is complete; faqs (faq_support) should be the next thing asked about
  assert.match(result.responseText, /questions|FAQ/i);
});

test("full happy path: classify -> fill every required field -> summary -> explicit confirmation -> done", async () => {
  let state = createInitialState("draft-1");

  const locked = await processTurn(state, "I run a soap shop, minimal support is fine", {
    classifyFn: async () => ({ lobKey: "minimal_support", confidence: 0.9 }),
    extractFn: noExtractions,
  });
  state = locked.state;

  const allFieldsByCall: Record<string, FieldExtraction[]> = {
    business_info: [
      { primitiveKey: "business_info", fieldKey: "business_name", value: "Meadow Soaps", confidence: 0.9 },
      { primitiveKey: "business_info", fieldKey: "description", value: "Handmade natural soaps.", confidence: 0.9 },
      { primitiveKey: "business_info", fieldKey: "hours", value: { mon_fri: "9-18" }, confidence: 0.9 },
    ],
    faq_support: [
      {
        primitiveKey: "faq_support",
        fieldKey: "faqs",
        value: [{ question: "Vegan?", answer: "Yes." }] satisfies PrimitiveFieldValues["faqs"],
        confidence: 0.9,
      },
    ],
    human_escalation: [
      { primitiveKey: "human_escalation", fieldKey: "escalation_prompt", value: "We'll reach out soon.", confidence: 0.9 },
    ],
  };

  for (const extractions of Object.values(allFieldsByCall)) {
    const extractFn: ExtractFieldsFn = async () => extractions;
    const turn = await processTurn(state, "here's the info", { classifyFn: confidentRetail, extractFn });
    state = turn.state;
  }

  const summaryTurn = await processTurn(state, "anything else?", { classifyFn: confidentRetail, extractFn: noExtractions });
  assert.equal(summaryTurn.done, false);
  assert.match(summaryTurn.responseText, /Does this look right/);

  const confirmTurn = await processTurn(summaryTurn.state, "yes that's correct", {
    classifyFn: confidentRetail,
    extractFn: noExtractions,
  });
  assert.equal(confirmTurn.done, true);
  assert.equal(confirmTurn.state.confirmed, true);
});
