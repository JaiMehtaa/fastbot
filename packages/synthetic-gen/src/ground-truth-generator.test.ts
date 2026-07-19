import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrimitiveFieldValues, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";
import { generateGroundTruthDraft } from "./ground-truth-generator.js";

const validValuesByPrimitive: Partial<Record<PrimitiveKey, PrimitiveFieldValues>> = {
  business_info: {
    business_name: "Meadow Soaps",
    description: "Handmade natural soaps.",
    hours: { mon_fri: "9:00-18:00" },
  },
  faq_support: {
    faqs: [{ question: "Are your soaps vegan?", answer: "Yes." }],
  },
  human_escalation: {
    escalation_prompt: "Someone will get back to you soon.",
  },
};

test("generates a valid draft on the first attempt when generateFieldValues always succeeds", async () => {
  let calls = 0;
  const draft = await generateGroundTruthDraft({
    lobKey: "minimal_support",
    generateFieldValues: async ({ primitiveKey }) => {
      calls += 1;
      return validValuesByPrimitive[primitiveKey] ?? {};
    },
  });

  assert.equal(calls, 3); // business_info, faq_support, human_escalation
  assert.equal(draft.lobKey, "minimal_support");
  assert.deepEqual([...draft.selectedPrimitives].sort(), ["business_info", "faq_support", "human_escalation"]);
});

test("retries a single primitive up to maxAttemptsPerPrimitive and succeeds once valid values arrive", async () => {
  let faqAttempts = 0;
  const draft = await generateGroundTruthDraft({
    lobKey: "minimal_support",
    maxAttemptsPerPrimitive: 3,
    generateFieldValues: async ({ primitiveKey }) => {
      if (primitiveKey === "faq_support") {
        faqAttempts += 1;
        if (faqAttempts < 2) return { faqs: [] }; // invalid: minItems 1
        return validValuesByPrimitive.faq_support!;
      }
      return validValuesByPrimitive[primitiveKey] ?? {};
    },
  });

  assert.equal(faqAttempts, 2);
  assert.ok((draft.fieldValues.faq_support?.faqs as unknown[]).length >= 1);
});

test("throws a clear error after exhausting attempts for a primitive that never becomes valid", async () => {
  await assert.rejects(
    () =>
      generateGroundTruthDraft({
        lobKey: "minimal_support",
        maxAttemptsPerPrimitive: 2,
        generateFieldValues: async ({ primitiveKey }) => {
          if (primitiveKey === "human_escalation") return {}; // always missing escalation_prompt
          return validValuesByPrimitive[primitiveKey] ?? {};
        },
      }),
    /Failed to generate valid field values for primitive "human_escalation" after 2 attempts/,
  );
});

test("throws on an unknown lobKey", async () => {
  await assert.rejects(
    () =>
      generateGroundTruthDraft({
        lobKey: "not_a_real_recipe",
        generateFieldValues: async () => ({}),
      }),
    /Unknown lob_recipe/,
  );
});
