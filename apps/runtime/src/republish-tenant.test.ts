import { test } from "node:test";
import assert from "node:assert/strict";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { createInMemoryRepository } from "./repository.js";
import { promoteDraftToTenant } from "./promote-tenant.js";
import { RepublishError, republishTenantConfig } from "./republish-tenant.js";

function validMinimalDraft(overrides: Partial<DraftConfig> = {}): DraftConfig {
  return {
    draftSessionId: "draft-republish-1",
    version: 1,
    lobKey: "minimal_support",
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: { business_name: "Meadow Soaps", description: "Handmade soaps.", hours: { mon_fri: "9-18" } },
      faq_support: { faqs: [{ question: "Vegan?", answer: "Yes." }] },
      human_escalation: { escalation_prompt: "We'll reach out soon." },
    },
    ...overrides,
  };
}

test("republishTenantConfig publishes a new version and updates what the phone number serves", async () => {
  const repository = createInMemoryRepository();
  const { tenantId } = await promoteDraftToTenant(validMinimalDraft(), "demo-phone-number", repository);

  const editedDraft = validMinimalDraft({
    draftSessionId: "draft-republish-2",
    fieldValues: {
      business_info: { business_name: "Meadow Soaps & Co.", description: "Handmade soaps.", hours: { mon_fri: "9-18" } },
      faq_support: { faqs: [{ question: "Vegan?", answer: "Yes." }] },
      human_escalation: { escalation_prompt: "We'll reach out soon." },
    },
  });

  const { version } = await republishTenantConfig(editedDraft, tenantId, repository);
  assert.equal(version, 2);

  const lookup = await repository.getTenantByPhoneNumberId("demo-phone-number");
  assert.match(lookup?.compiledConfig.rootMenu.headerText ?? "", /Meadow Soaps & Co\./);

  const details = await repository.getTenantById(tenantId);
  assert.equal(details?.sourceDraftSessionId, "draft-republish-2");
});

test("republishTenantConfig rejects an invalid draft rather than silently breaking a live bot", async () => {
  const repository = createInMemoryRepository();
  const { tenantId } = await promoteDraftToTenant(validMinimalDraft(), "demo-phone-number", repository);

  const brokenDraft = validMinimalDraft({
    draftSessionId: "draft-republish-broken",
    fieldValues: { business_info: { business_name: "Meadow Soaps" } }, // missing description, hours, faqs, escalation_prompt
  });

  await assert.rejects(() => republishTenantConfig(brokenDraft, tenantId, repository), RepublishError);

  const lookup = await repository.getTenantByPhoneNumberId("demo-phone-number");
  assert.match(lookup?.compiledConfig.rootMenu.headerText ?? "", /Meadow Soaps/);
  assert.doesNotMatch(lookup?.compiledConfig.rootMenu.headerText ?? "", /Meadow Soaps & Co\./);
});
