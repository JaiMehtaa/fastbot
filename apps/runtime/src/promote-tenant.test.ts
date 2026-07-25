import { test } from "node:test";
import assert from "node:assert/strict";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { createInMemoryRepository } from "./repository.js";
import { PromotionError, promoteDraftToTenant } from "./promote-tenant.js";

function validMinimalDraft(): DraftConfig {
  return {
    draftSessionId: "draft-promote-1",
    version: 1,
    lobKey: "minimal_support",
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: { business_name: "Meadow Soaps", description: "Handmade soaps.", hours: { mon_fri: "9-18" } },
      faq_support: { faqs: [{ question: "Vegan?", answer: "Yes." }] },
      human_escalation: { escalation_prompt: "We'll reach out soon." },
    },
  };
}

test("promoteDraftToTenant creates a tenant servable by phone_number_id", async () => {
  const repository = createInMemoryRepository();
  const { tenantId } = await promoteDraftToTenant(validMinimalDraft(), "demo-phone-number", repository);

  assert.ok(tenantId);
  const lookup = await repository.getTenantByPhoneNumberId("demo-phone-number");
  assert.equal(lookup?.tenantId, tenantId);
  assert.equal(lookup?.compiledConfig.rootMenu.entries.length, 3);
});

test("promoteDraftToTenant uses the business_name from field_values as the tenant name", async () => {
  const repository = createInMemoryRepository();
  await promoteDraftToTenant(validMinimalDraft(), "demo-phone-number", repository);
  const lookup = await repository.getTenantByPhoneNumberId("demo-phone-number");
  assert.match(lookup?.compiledConfig.rootMenu.headerText ?? "", /Meadow Soaps/);
});

test("promoteDraftToTenant rejects an invalid draft rather than silently promoting a broken bot", async () => {
  const invalidDraft: DraftConfig = {
    draftSessionId: "draft-invalid",
    version: 1,
    lobKey: "minimal_support",
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: { business_info: { business_name: "Meadow Soaps" } }, // missing description, hours, faqs, escalation_prompt
  };

  const repository = createInMemoryRepository();
  await assert.rejects(() => promoteDraftToTenant(invalidDraft, "demo-phone-number", repository), PromotionError);
  assert.equal(await repository.getTenantByPhoneNumberId("demo-phone-number"), null);
});
