import { test } from "node:test";
import assert from "node:assert/strict";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { validateDraft } from "./validate.js";
import { compile } from "./compile.js";

function retailDraft(overrides: Partial<DraftConfig["fieldValues"]> = {}): DraftConfig {
  return {
    draftSessionId: "draft-1",
    version: 1,
    lobKey: "retail_d2c",
    selectedPrimitives: ["business_info", "catalogue", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: {
        business_name: "Zap Home Care",
        description: "We make dishwash and laundry care products.",
        hours: { mon_fri: "9:00-19:00", sat: "9:00-17:00", sun: "closed" },
      },
      catalogue: {
        items: [{ name: "ShineZap Dishwash Bar", link: "https://amazon.in/dp/xyz" }],
      },
      faq_support: {
        faqs: [{ question: "Do you ship pan-India?", answer: "Yes, across India." }],
      },
      human_escalation: {
        escalation_prompt: "I'll get someone from our team to reach out to you shortly.",
      },
      ...overrides,
    },
  };
}

test("a fully-filled retail_d2c draft validates clean", () => {
  const result = validateDraft(retailDraft());
  assert.equal(result.valid, true);
  assert.deepEqual(result.missingRequiredFields, []);
  assert.deepEqual(result.issues, []);
});

test("compiling a valid draft produces one root-menu entry and correct state table per primitive", () => {
  const compiled = compile(retailDraft());

  assert.equal(compiled.rootMenu.entries.length, 4);
  const entryIds = compiled.rootMenu.entries.map((e) => e.id).sort();
  assert.deepEqual(entryIds, [
    "root_business_info",
    "root_catalogue",
    "root_faq_support",
    "root_human_escalation",
  ]);

  const expectedStates = [
    "BUSINESS_INFO_VIEW",
    "CATALOGUE_LIST",
    "CATALOGUE_ITEM_DETAIL",
    "FAQ_MENU",
    "FAQ_ANSWER",
    "FAQ_FALLBACK",
    "ESCALATION_CONFIRM",
    "ESCALATION_ACTIVE",
  ];
  for (const state of expectedStates) {
    assert.ok(state in compiled.stateTable, `expected stateTable to contain ${state}`);
  }
  assert.equal(compiled.stateTable.CATALOGUE_LIST?.primitiveKey, "catalogue");
});

test("an empty catalogue.items surfaces as a missing required field, not compiled", () => {
  const draft = retailDraft({ catalogue: { items: [] } });
  const result = validateDraft(draft);

  assert.equal(result.valid, false);
  assert.ok(
    result.missingRequiredFields.some((f) => f.primitiveKey === "catalogue" && f.fieldKey === "items"),
  );
  assert.throws(() => compile(draft), /Cannot compile an invalid draft/);
});

test("a catalogue item missing its required link surfaces as a validation issue", () => {
  const draft = retailDraft({ catalogue: { items: [{ name: "ShineZap Dishwash Bar" }] } });
  const result = validateDraft(draft);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.fieldKey === "items" && /link/.test(issue.message)));
});

test("missing business_info.hours is reported as a missing required field with an interview hint", () => {
  const draft = retailDraft({
    business_info: { business_name: "Zap Home Care", description: "We make home care products." },
  });
  const result = validateDraft(draft);

  const missing = result.missingRequiredFields.find(
    (f) => f.primitiveKey === "business_info" && f.fieldKey === "hours",
  );
  assert.ok(missing, "expected business_info.hours to be flagged as missing");
  assert.ok(missing?.interviewHint.length && missing.interviewHint.length > 0);
});

test("selecting booking without business_info.hours fails the cross-primitive check", () => {
  const draft: DraftConfig = {
    draftSessionId: "draft-2",
    version: 1,
    lobKey: "salon_services",
    selectedPrimitives: ["human_escalation", "booking"],
    fieldValues: {
      human_escalation: { escalation_prompt: "Someone will reach out shortly." },
    },
  };
  const result = validateDraft(draft);

  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((issue) => issue.primitiveKey === "booking" && /business_info\.hours/.test(issue.message)),
  );
});

test("selecting a primitive not yet in the registry is reported, not thrown", () => {
  const draft = retailDraft();
  const draftWithOrderMgmt: DraftConfig = {
    ...draft,
    selectedPrimitives: [...draft.selectedPrimitives, "order_management"],
  };
  const result = validateDraft(draftWithOrderMgmt);

  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((issue) => issue.primitiveKey === "order_management" && /not yet available/.test(issue.message)),
  );
});
