import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig, InboundMessage } from "@whatsapp-bot-platform/shared-types";
import { createMockBspAdapter } from "./bsp-adapter.js";
import { createInterpreter } from "./interpreter.js";
import { processInboundMessage, type ProcessInboundMessageDeps } from "./process-inbound-message.js";
import { createInMemoryRepository } from "./repository.js";
import type { WhatsAppOutboundButtonMessage, WhatsAppOutboundListMessage } from "./whatsapp-payload.js";

const SANDBOX_NUMBER = "sandbox-phone-number-id";

function retailDraft(): DraftConfig {
  return {
    draftSessionId: "runtime-e2e",
    version: 1,
    lobKey: "retail_d2c",
    selectedPrimitives: ["business_info", "catalogue", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: {
        business_name: "Zap Home Care",
        description: "We make dishwash and laundry care products.",
        hours: { mon_fri: "9:00-19:00" },
      },
      catalogue: { items: [{ name: "ShineZap Dishwash Bar", link: "https://amazon.in/dp/shinezap" }] },
      faq_support: { faqs: [{ question: "Do you ship pan-India?", answer: "Yes, across India." }] },
      human_escalation: { escalation_prompt: "Someone from our team will reach out shortly." },
    },
  };
}

function textMessage(text: string, waId = "wa-1"): InboundMessage {
  return { waId, messageId: `m-${Date.now()}-${Math.random()}`, type: "text", text, receivedAt: new Date().toISOString() };
}

function replyMessage(interactiveReplyId: string, waId = "wa-1"): InboundMessage {
  return {
    waId,
    messageId: `m-${Date.now()}-${Math.random()}`,
    type: "interactive",
    interactiveReplyId,
    receivedAt: new Date().toISOString(),
  };
}

function makeDeps(overrides: Partial<ProcessInboundMessageDeps> = {}): ProcessInboundMessageDeps {
  return {
    repository: createInMemoryRepository(),
    bspAdapter: createMockBspAdapter(),
    interpret: createInterpreter(async () => null),
    sandboxPhoneNumberId: SANDBOX_NUMBER,
    ...overrides,
  };
}

test("processInboundMessage returns unknown_number for a phone_number_id with no matching tenant", async () => {
  const result = await processInboundMessage("nobody-owns-this-number", textMessage("hi"), makeDeps());
  assert.deepEqual(result, { status: "unknown_number" });
});

test("processInboundMessage prompts a sandbox join when the wa_id isn't bound and the text isn't a JOIN command", async () => {
  const result = await processInboundMessage(SANDBOX_NUMBER, textMessage("hi there"), makeDeps());
  assert.deepEqual(result, { status: "sandbox_join_prompt" });
});

test("processInboundMessage: joining the sandbox sends the draft's root menu as the first reply", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const compiled = compile(retailDraft());
  repository.draftsBySessionId.set("draft-1", compiled);
  repository.waBindings.set("tok-1", {
    token: "tok-1",
    draftSessionId: "draft-1",
    waId: null,
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await processInboundMessage(SANDBOX_NUMBER, textMessage("JOIN tok-1"), makeDeps({ repository, bspAdapter }));

  assert.deepEqual(result, { status: "processed" });
  assert.equal(bspAdapter.sentMessages.length, 1);
  assert.equal((bspAdapter.sentMessages[0] as WhatsAppOutboundListMessage).interactive.type, "list");
  const state = await repository.getConversationState("draft", "draft-1", "wa-1");
  assert.equal(state?.currentState, "ROOT");
});

test("processInboundMessage runs a full turn for a live tenant: logs inbound+outbound, updates state", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const compiled = compile(retailDraft());
  repository.tenantsByPhoneNumberId.set("tenant-number", { tenantId: "tenant-1", compiledConfig: compiled });

  const result = await processInboundMessage(
    "tenant-number",
    replyMessage("root_catalogue"),
    makeDeps({ repository, bspAdapter }),
  );

  assert.deepEqual(result, { status: "processed" });
  assert.equal(bspAdapter.sentMessages.length, 1);
  assert.equal(repository.chatHistory.filter((e) => e.direction === "inbound").length, 1);
  assert.equal(repository.chatHistory.filter((e) => e.direction === "outbound").length, 1);
  const state = await repository.getConversationState("tenant", "tenant-1", "wa-1");
  assert.equal(state?.currentState, "CATALOGUE_LIST");
});

test("processInboundMessage resets to ROOT after a 24h-expired session", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const compiled = compile(retailDraft());
  repository.tenantsByPhoneNumberId.set("tenant-number", { tenantId: "tenant-1", compiledConfig: compiled });
  await repository.upsertConversationState({
    contextType: "tenant",
    contextId: "tenant-1",
    waId: "wa-1",
    currentState: "CATALOGUE_ITEM_DETAIL",
    lastInteraction: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
  });

  await processInboundMessage("tenant-number", textMessage("hello?"), makeDeps({ repository, bspAdapter }));

  // a stale-state reply with free text and no matching root entry re-renders the root menu
  assert.equal((bspAdapter.sentMessages[0] as WhatsAppOutboundListMessage).interactive.type, "list");
  const state = await repository.getConversationState("tenant", "tenant-1", "wa-1");
  assert.equal(state?.currentState, "ROOT");
});

test("processInboundMessage escalation creates a support ticket and a dashboard notification for a live tenant", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const compiled = compile(retailDraft());
  repository.tenantsByPhoneNumberId.set("tenant-number", { tenantId: "tenant-1", compiledConfig: compiled });
  await repository.upsertConversationState({
    contextType: "tenant",
    contextId: "tenant-1",
    waId: "wa-1",
    currentState: "ESCALATION_CONFIRM",
    lastInteraction: new Date().toISOString(),
  });

  await processInboundMessage(
    "tenant-number",
    replyMessage("escalation_confirm"),
    makeDeps({ repository, bspAdapter }),
  );

  assert.equal(repository.supportTickets.length, 1);
  assert.equal(repository.dashboardNotifications.length, 1);
  assert.equal(repository.dashboardNotifications[0]?.tenantId, "tenant-1");
  assert.equal(repository.dashboardNotifications[0]?.type, "escalation");
});

test("processInboundMessage escalation on a sandbox draft creates a ticket but no dashboard notification (no tenant to notify)", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const compiled = compile(retailDraft());
  repository.draftsBySessionId.set("draft-1", compiled);
  repository.waBindings.set("tok-1", {
    token: "tok-1",
    draftSessionId: "draft-1",
    waId: "wa-1",
    status: "bound",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await repository.upsertConversationState({
    contextType: "draft",
    contextId: "draft-1",
    waId: "wa-1",
    currentState: "ESCALATION_CONFIRM",
    lastInteraction: new Date().toISOString(),
  });

  await processInboundMessage(SANDBOX_NUMBER, replyMessage("escalation_confirm"), makeDeps({ repository, bspAdapter }));

  assert.equal(repository.supportTickets.length, 1);
  assert.equal(repository.dashboardNotifications.length, 0);
});

test("processInboundMessage: an ambiguous fallback question hands off to the escalation prompt in the same turn", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const compiled = compile(retailDraft());
  repository.tenantsByPhoneNumberId.set("tenant-number", { tenantId: "tenant-1", compiledConfig: compiled });
  await repository.upsertConversationState({
    contextType: "tenant",
    contextId: "tenant-1",
    waId: "wa-1",
    currentState: "FAQ_MENU",
    lastInteraction: new Date().toISOString(),
  });

  await processInboundMessage(
    "tenant-number",
    textMessage("something totally unrelated"),
    makeDeps({ repository, bspAdapter, interpret: createInterpreter(async () => null) }),
  );

  const state = await repository.getConversationState("tenant", "tenant-1", "wa-1");
  assert.equal(state?.currentState, "ESCALATION_CONFIRM");
  assert.match((bspAdapter.sentMessages[0] as WhatsAppOutboundButtonMessage).interactive.body.text, /reach out shortly/);
});
