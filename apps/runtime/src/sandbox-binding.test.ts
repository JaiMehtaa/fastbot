import { test } from "node:test";
import assert from "node:assert/strict";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { handleSandboxJoin } from "./context-resolver.js";
import { createInMemoryRepository } from "./repository.js";
import { SandboxBindingError, issueSandboxBinding } from "./sandbox-binding.js";

function validMinimalDraft(): DraftConfig {
  return {
    draftSessionId: "draft-sandbox-1",
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

test("issues a token, a working wa.me deep link, and stores the compiled draft for a valid draft", async () => {
  const repository = createInMemoryRepository();
  const result = await issueSandboxBinding(validMinimalDraft(), "911234567890", repository);

  assert.ok(result.token);
  assert.equal(result.joinUrl, `https://wa.me/911234567890?text=${encodeURIComponent(`JOIN ${result.token}`)}`);
  assert.ok(new Date(result.expiresAt).getTime() > Date.now());

  const binding = await repository.getDraftWaBinding(result.token);
  assert.equal(binding?.status, "pending");
  assert.equal(binding?.draftSessionId, "draft-sandbox-1");
});

test("rejects an invalid draft rather than issuing a token for a broken bot", async () => {
  const invalidDraft: DraftConfig = {
    draftSessionId: "draft-sandbox-invalid",
    version: 1,
    lobKey: "minimal_support",
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: { business_info: { business_name: "Meadow Soaps" } },
  };
  const repository = createInMemoryRepository();
  await assert.rejects(() => issueSandboxBinding(invalidDraft, "911234567890", repository), SandboxBindingError);
});

test("an issued token can actually be joined via handleSandboxJoin — the full issue-then-consume loop", async () => {
  const repository = createInMemoryRepository();
  const { token } = await issueSandboxBinding(validMinimalDraft(), "911234567890", repository);

  const result = await handleSandboxJoin(`JOIN ${token}`, "919999999999", repository);
  assert.equal(result.joined, true);
  assert.equal(result.context?.contextType, "draft");
  assert.equal(result.context?.contextId, "draft-sandbox-1");
  assert.match(result.context?.compiledConfig.rootMenu.headerText ?? "", /Meadow Soaps/);
});

test("a stranger's typo'd token doesn't join anything", async () => {
  const repository = createInMemoryRepository();
  await issueSandboxBinding(validMinimalDraft(), "911234567890", repository);

  const result = await handleSandboxJoin("JOIN wrongtoken", "919999999999", repository);
  assert.equal(result.joined, false);
});

test("respects a custom ttlMs — an already-expired binding can't be joined", async () => {
  const repository = createInMemoryRepository();
  const { token } = await issueSandboxBinding(validMinimalDraft(), "911234567890", repository, { ttlMs: -1000 });

  const result = await handleSandboxJoin(`JOIN ${token}`, "919999999999", repository);
  assert.equal(result.joined, false);
});
