import { test } from "node:test";
import assert from "node:assert/strict";
import { listPrimitives } from "@whatsapp-bot-platform/schema";
import type { ClassifyCapabilitiesFn } from "./capability-classifier.js";
import type { ExtractFieldsFn, FieldExtraction } from "./field-extractor.js";
import type { ExtractOwnerInfoFn } from "./owner-info-extractor.js";
import type { PhraseQuestionFn } from "./question-phraser.js";
import type { ScrapeWebsiteFn } from "./website-scraper.js";
import { createInitialState, processTurn, type InterviewDeps, type InterviewSessionState } from "./interview-session.js";

const confidentRetail: ClassifyCapabilitiesFn = async () => ({
  selectedPrimitives: ["catalogue", "faq_support"],
  confidence: 0.9,
});
const alwaysAmbiguous: ClassifyCapabilitiesFn = async () => ({
  selectedPrimitives: [],
  confidence: 0.1,
  reason: "too vague",
});
const noneAdditional: ClassifyCapabilitiesFn = async () => ({ selectedPrimitives: [], confidence: 0.9 });
const noExtractions: ExtractFieldsFn = async () => [];
const noOwnerInfo: ExtractOwnerInfoFn = async () => ({ name: null, contact: null });
const jaiOwnerInfo: ExtractOwnerInfoFn = async () => ({
  name: { value: "Jai", confidence: 0.9 },
  contact: { value: "jai@example.com", confidence: 0.9 },
});
const noScrape: ScrapeWebsiteFn = async () => ({ status: "unreachable", reason: "no scraping in this test" });

function baseDeps(overrides: Partial<InterviewDeps> = {}): InterviewDeps {
  return { classifyFn: confidentRetail, extractFn: noExtractions, extractOwnerInfoFn: noOwnerInfo, scrapeFn: noScrape, ...overrides };
}

/** Fast-forwards past the owner_info stage with both name and contact given in one turn. */
async function pastOwnerInfo(deps: InterviewDeps = baseDeps()): Promise<InterviewSessionState> {
  const state = createInitialState("draft-1");
  const result = await processTurn(state, "I'm Jai, you can reach me at jai@example.com", { ...deps, extractOwnerInfoFn: jaiOwnerInfo });
  return result.state;
}

/** Fast-forwards a locked-into-awaiting_website state past the website step by declining it. */
async function declineWebsite(state: InterviewSessionState, deps: InterviewDeps = baseDeps()): Promise<InterviewSessionState> {
  const result = await processTurn(state, "no website", deps);
  return result.state;
}

async function lockedRetailState(): Promise<InterviewSessionState> {
  let state = await pastOwnerInfo();
  const detected = await processTurn(state, "I run a soap shop", baseDeps());
  state = detected.state;
  const afterCatchAll = await processTurn(state, "no that's everything", baseDeps({ classifyFn: noneAdditional }));
  state = await declineWebsite(afterCatchAll.state);
  return state;
}

test("owner_info: name and contact given together in one turn move straight to capability detection", async () => {
  const state = createInitialState("draft-1");
  const result = await processTurn(state, "I'm Jai, you can reach me at jai@example.com", {
    ...baseDeps(),
    extractOwnerInfoFn: jaiOwnerInfo,
  });

  assert.equal(result.state.ownerName, "Jai");
  assert.equal(result.state.ownerContact, "jai@example.com");
  assert.equal(result.state.interviewStage, "detecting");
  assert.match(result.responseText, /tell me a bit about your business/i);
});

test("owner_info: only a name given asks one targeted follow-up for contact, then moves on once answered", async () => {
  const state = createInitialState("draft-1");
  const nameOnly: ExtractOwnerInfoFn = async () => ({ name: { value: "Jai", confidence: 0.9 }, contact: null });
  const first = await processTurn(state, "I'm Jai", { ...baseDeps(), extractOwnerInfoFn: nameOnly });

  assert.equal(first.state.ownerName, "Jai");
  assert.equal(first.state.ownerContact, null);
  assert.equal(first.state.interviewStage, "owner_info");
  assert.equal(first.state.ownerInfoAsked, true);
  assert.match(first.responseText, /reach you/i);
  assert.ok(!first.responseText.toLowerCase().includes("what's your name"), "should not re-ask for the name it already has");

  const contactOnly: ExtractOwnerInfoFn = async () => ({ name: null, contact: { value: "9999999999", confidence: 0.9 } });
  const second = await processTurn(first.state, "9999999999", { ...baseDeps(), extractOwnerInfoFn: contactOnly });
  assert.equal(second.state.ownerContact, "9999999999");
  assert.equal(second.state.interviewStage, "detecting");
});

test("owner_info: still missing info after the one follow-up moves on regardless, never blocking the interview", async () => {
  const state = createInitialState("draft-1");
  const first = await processTurn(state, "hey", baseDeps());
  assert.equal(first.state.interviewStage, "owner_info");
  assert.equal(first.state.ownerInfoAsked, true);

  const second = await processTurn(first.state, "let's just get started", baseDeps());
  assert.equal(second.state.interviewStage, "detecting");
  assert.equal(second.state.ownerName, null);
});

test("first capability turn asks the anything-else catch-all before locking", async () => {
  const state = await pastOwnerInfo();
  const result = await processTurn(state, "I sell handmade soaps online", baseDeps());

  assert.equal(result.state.interviewStage, "awaiting_more");
  assert.equal(result.state.selectedPrimitives.length, 0);
  assert.ok(result.state.pendingPrimitives?.includes("catalogue"));
  assert.match(result.responseText, /anything else/i);
  assert.equal(result.done, false);
});

test("the catch-all's suggested examples come from the live registry, never a hardcoded name for a primitive that isn't selectable", async () => {
  // Regression: this used to hardcode "appointments, capturing leads" — found live, a customer who'd
  // already asked for appointments got asked about them again by name, with no booking primitive to
  // ever attach a "yes" to. Suggestions must only ever name primitives listPrimitives() actually returns.
  const state = await pastOwnerInfo();
  const result = await processTurn(state, "I run a business", baseDeps({ classifyFn: async () => ({ selectedPrimitives: [], confidence: 0.9 }) }));

  const registeredKeys = new Set(listPrimitives().map((schema) => schema.key));
  for (const notYetReal of ["booking", "lead_capture", "order_management"] as const) {
    if (!registeredKeys.has(notYetReal)) {
      assert.ok(!result.responseText.toLowerCase().includes(notYetReal.replace("_", " ")), `should not mention unregistered "${notYetReal}"`);
    }
  }
});

test("declining the catch-all finalizes selectedPrimitives and moves to the website step", async () => {
  let state = await pastOwnerInfo();
  const detected = await processTurn(state, "I sell handmade soaps online", baseDeps());
  state = detected.state;

  const result = await processTurn(state, "no that's everything", baseDeps({ classifyFn: noneAdditional }));
  assert.equal(result.state.interviewStage, "awaiting_website");
  assert.equal(result.state.pendingPrimitives, null);
  assert.match(result.responseText, /website/i);
  const expected = ["catalogue", "faq_support", "business_info", "human_escalation"] as const;
  for (const key of expected) {
    assert.ok(result.state.selectedPrimitives.includes(key), `expected "${key}" to be selected`);
  }
});

test("answering the catch-all with a new need adds it on top of what was already detected", async () => {
  let state = await pastOwnerInfo();
  // detects only catalogue this turn (faq_support intentionally left out to prove the follow-up can add capabilities)
  const detected = await processTurn(state, "I sell handmade soaps online", baseDeps({ classifyFn: async () => ({ selectedPrimitives: ["catalogue"], confidence: 0.9 }) }));
  state = detected.state;
  assert.ok(!state.selectedPrimitives.includes("faq_support"));

  const addsFaq: ClassifyCapabilitiesFn = async () => ({ selectedPrimitives: ["faq_support"], confidence: 0.9 });
  const result = await processTurn(state, "actually people ask us questions a lot too", baseDeps({ classifyFn: addsFaq }));

  assert.equal(result.state.interviewStage, "awaiting_website");
  assert.ok(result.state.selectedPrimitives.includes("catalogue"));
  assert.ok(result.state.selectedPrimitives.includes("faq_support"));
});

test("an ambiguous business description asks one clarifying question without classifying anything yet", async () => {
  const state = await pastOwnerInfo();
  const result = await processTurn(state, "we do stuff", baseDeps({ classifyFn: alwaysAmbiguous }));

  assert.equal(result.state.interviewStage, "detecting");
  assert.equal(result.state.capabilityAmbiguityAsked, true);
  assert.match(result.responseText, /tell me a bit more/);
});

test("a second consecutive ambiguous classification falls back to minimal_support instead of looping forever", async () => {
  let state = await pastOwnerInfo();
  const first = await processTurn(state, "we do stuff", baseDeps({ classifyFn: alwaysAmbiguous }));
  state = first.state;

  const second = await processTurn(state, "still vague", baseDeps({ classifyFn: alwaysAmbiguous }));
  assert.equal(second.state.lobKey, "minimal_support");
  assert.equal(second.state.interviewStage, "awaiting_website");
  assert.ok(second.state.selectedPrimitives.includes("faq_support"));
  assert.ok(second.state.selectedPrimitives.includes("human_escalation"));
});

test("declining the website step moves into the missing-field loop", async () => {
  let state = await pastOwnerInfo();
  const detected = await processTurn(state, "I run a soap shop", baseDeps());
  const afterCatchAll = await processTurn(detected.state, "no that's everything", baseDeps({ classifyFn: noneAdditional }));
  assert.equal(afterCatchAll.state.interviewStage, "awaiting_website");

  const result = await processTurn(afterCatchAll.state, "no I don't have one", baseDeps());
  assert.equal(result.state.interviewStage, "locked");
  assert.ok(result.responseText.length > 0);
});

test("a website URL that fails to scrape still moves into the field loop, with an apology prefix", async () => {
  let state = await pastOwnerInfo();
  const detected = await processTurn(state, "I run a soap shop", baseDeps());
  const afterCatchAll = await processTurn(detected.state, "no that's everything", baseDeps({ classifyFn: noneAdditional }));

  const failingScrape: ScrapeWebsiteFn = async () => ({ status: "unreachable", reason: "DNS error" });
  const result = await processTurn(afterCatchAll.state, "https://meadowsoaps.example", baseDeps({ scrapeFn: failingScrape }));
  assert.equal(result.state.interviewStage, "locked");
  assert.match(result.responseText, /couldn't reach/i);
});

test("a website URL that scrapes successfully pre-fills required fields and stores the URL itself", async () => {
  let state = await pastOwnerInfo();
  const detected = await processTurn(state, "I run a soap shop", baseDeps());
  const afterCatchAll = await processTurn(detected.state, "no that's everything", baseDeps({ classifyFn: noneAdditional }));

  const successfulScrape: ScrapeWebsiteFn = async (url) => ({
    status: "ok",
    site: { url, text: "Meadow Soaps. We make handmade natural soaps. Open 9-6 Mon-Fri.", pagesFetched: [url] },
  });
  const extractFromScrape: ExtractFieldsFn = async ({ missingFields }) =>
    missingFields
      .filter((f) => f.primitiveKey === "business_info" && f.fieldKey === "business_name")
      .map((f) => ({ primitiveKey: f.primitiveKey, fieldKey: f.fieldKey, value: "Meadow Soaps", confidence: 0.9 }));

  const result = await processTurn(
    afterCatchAll.state,
    "yes, https://meadowsoaps.example",
    baseDeps({ scrapeFn: successfulScrape, extractFn: extractFromScrape }),
  );

  assert.equal(result.state.interviewStage, "locked");
  assert.equal(result.state.fieldValues.business_info?.business_name, "Meadow Soaps");
  assert.equal(result.state.fieldValues.business_info?.website, "https://meadowsoaps.example");
  assert.match(result.responseText, /pulled in some details/i);
});

test("a website answer with no scheme (e.g. \"example.com\") is still recognized as a URL, not silently treated as declining", async () => {
  let state = await pastOwnerInfo();
  const detected = await processTurn(state, "I run a soap shop", baseDeps());
  const afterCatchAll = await processTurn(detected.state, "no that's everything", baseDeps({ classifyFn: noneAdditional }));

  const successfulScrape: ScrapeWebsiteFn = async (url) => ({
    status: "ok",
    site: { url, text: "Meadow Soaps. We make handmade natural soaps.", pagesFetched: [url] },
  });

  const result = await processTurn(afterCatchAll.state, "meadowsoaps.example", baseDeps({ scrapeFn: successfulScrape }));

  assert.equal(result.state.fieldValues.business_info?.website, "https://meadowsoaps.example");
});

test("declining to give a website (no URL, no explicit decline) still moves on rather than looping", async () => {
  let state = await pastOwnerInfo();
  const detected = await processTurn(state, "I run a soap shop", baseDeps());
  const afterCatchAll = await processTurn(detected.state, "no that's everything", baseDeps({ classifyFn: noneAdditional }));

  const result = await processTurn(afterCatchAll.state, "not right now", baseDeps());
  assert.equal(result.state.interviewStage, "locked");
});

test("phraseFn is applied to question text but never to the field-value summary", async () => {
  const seen: string[] = [];
  const trackingPhrase: PhraseQuestionFn = async ({ rawText }) => {
    seen.push(rawText);
    return `PHRASED: ${rawText}`;
  };

  const state = createInitialState("draft-1");
  const result = await processTurn(state, "hi", baseDeps({ phraseFn: trackingPhrase }));
  assert.match(result.responseText, /^PHRASED: /);
  assert.equal(seen.length, 1);

  const summaryState: InterviewSessionState = {
    draftSessionId: "draft-1",
    lobKey: "minimal_support",
    interviewStage: "locked",
    ownerName: "Jai",
    ownerContact: "jai@example.com",
    ownerInfoAsked: false,
    capabilityAmbiguityAsked: false,
    pendingPrimitives: null,
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: { business_name: "Meadow Soaps", description: "Handmade soaps.", hours: { mon_fri: "9-18" } },
      faq_support: { faqs: [{ question: "Vegan?", answer: "Yes." }] },
      human_escalation: { escalation_prompt: "We'll reach out." },
    },
    confirmed: false,
  };
  const summaryResult = await processTurn(summaryState, "anything else?", baseDeps({ phraseFn: trackingPhrase }));
  assert.match(summaryResult.responseText, /Does this look right/);
  assert.ok(!summaryResult.responseText.startsWith("PHRASED:"), "the summary must not be paraphrased");
});

test("extraction commits a field and validateDraft-driven flow asks for the next missing field", async () => {
  const state = await lockedRetailState();
  assert.equal(state.selectedPrimitives.includes("business_info"), true);

  const extractFn: ExtractFieldsFn = async () => [
    { primitiveKey: "business_info", fieldKey: "business_name", value: "Meadow Soaps", confidence: 0.9 },
  ];
  const afterExtraction = await processTurn(state, "We're called Meadow Soaps", baseDeps({ extractFn }));

  assert.equal(afterExtraction.state.fieldValues.business_info?.business_name, "Meadow Soaps");
  // still missing other required fields (description, hours) -> not done yet
  assert.equal(afterExtraction.done, false);
});

test("a low-confidence extraction is not committed — the field stays missing and gets asked again", async () => {
  const state = await lockedRetailState();

  const lowConfidenceExtractFn: ExtractFieldsFn = async () => [
    { primitiveKey: "business_info", fieldKey: "business_name", value: "maybe Meadow?", confidence: 0.2 },
  ];
  const result = await processTurn(state, "uh, something with soap I think", baseDeps({ extractFn: lowConfidenceExtractFn }));

  assert.equal(result.state.fieldValues.business_info?.business_name, undefined);
});

test("resumability: a session resumed from stored field_values (no conversation history) asks for the correct next field", async () => {
  const partiallyFilledState: InterviewSessionState = {
    draftSessionId: "draft-1",
    lobKey: "minimal_support",
    interviewStage: "locked",
    ownerName: "Jai",
    ownerContact: "jai@example.com",
    ownerInfoAsked: false,
    capabilityAmbiguityAsked: false,
    pendingPrimitives: null,
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: { business_name: "Meadow Soaps", description: "Handmade soaps.", hours: { mon_fri: "9-18" } },
    },
    confirmed: false,
  };

  const result = await processTurn(partiallyFilledState, "hey I'm back", baseDeps());

  // business_info is complete; faqs (faq_support) should be the next thing asked about
  assert.match(result.responseText, /questions|FAQ/i);
});

test("full happy path: owner info -> classify -> anything else -> website -> fill every required field -> summary -> explicit confirmation -> done", async () => {
  let state = await pastOwnerInfo();

  const detected = await processTurn(state, "I run a soap shop", baseDeps({ classifyFn: async () => ({ selectedPrimitives: [], confidence: 0.9 }) }));
  state = detected.state;
  assert.equal(state.interviewStage, "awaiting_more");

  const afterCatchAll = await processTurn(state, "no, minimal support is fine", baseDeps({ classifyFn: noneAdditional }));
  state = afterCatchAll.state;
  assert.equal(state.interviewStage, "awaiting_website");

  const afterWebsite = await declineWebsite(state);
  state = afterWebsite;
  assert.equal(state.interviewStage, "locked");

  const allFieldsByCall: Record<string, FieldExtraction[]> = {
    business_info: [
      { primitiveKey: "business_info", fieldKey: "business_name", value: "Meadow Soaps", confidence: 0.9 },
      { primitiveKey: "business_info", fieldKey: "description", value: "Handmade natural soaps.", confidence: 0.9 },
      { primitiveKey: "business_info", fieldKey: "hours", value: { mon_fri: "9-18" }, confidence: 0.9 },
    ],
    human_escalation: [
      { primitiveKey: "human_escalation", fieldKey: "escalation_prompt", value: "We'll reach out soon.", confidence: 0.9 },
    ],
  };

  for (const extractions of Object.values(allFieldsByCall)) {
    const extractFn: ExtractFieldsFn = async () => extractions;
    const turn = await processTurn(state, "here's the info", baseDeps({ extractFn }));
    state = turn.state;
  }

  const summaryTurn = await processTurn(state, "anything else?", baseDeps());
  assert.equal(summaryTurn.done, false);
  assert.match(summaryTurn.responseText, /Does this look right/);

  const confirmTurn = await processTurn(summaryTurn.state, "yes that's correct", baseDeps());
  assert.equal(confirmTurn.done, true);
  assert.equal(confirmTurn.state.confirmed, true);
});
