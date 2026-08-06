import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDbClient } from "@whatsapp-bot-platform/db";
import type { CompiledConfig } from "@whatsapp-bot-platform/shared-types";
import { createDbRepository } from "./db-repository.js";

/**
 * Real integration tests against a live Postgres instance — skipped
 * entirely when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set (a fresh
 * clone or CI without a local Supabase stack running via `supabase start`
 * in packages/db) rather than failing, since this repository's whole job is
 * talking to a real database — there's no meaningful way to unit-test it
 * against a mock without just re-testing the mock. createInMemoryRepository
 * (repository.test.ts) is what everything else in this codebase tests
 * against without live infra.
 */
const hasLiveDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function sampleCompiledConfig(sourceId: string): CompiledConfig {
  return {
    sourceId,
    version: 1,
    compiledAt: new Date().toISOString(),
    rootMenu: { headerText: "Welcome to Test Co! 🏢", bodyText: "How can we help?", entries: [] },
    stateTable: {},
  };
}

test("db-repository: createTenant + getTenantByPhoneNumberId round-trip a real tenant and its compiled config", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const phoneNumberId = `test-phone-${randomUUID()}`;

  const { tenantId } = await repository.createTenant({
    name: "Test Co",
    phoneNumberId,
    compiledConfig: sampleCompiledConfig("draft-x"),
  });
  assert.ok(tenantId);

  const lookup = await repository.getTenantByPhoneNumberId(phoneNumberId);
  assert.equal(lookup?.tenantId, tenantId);
  assert.match(lookup?.compiledConfig.rootMenu.headerText ?? "", /Test Co/);
});

test("db-repository: markDraftSessionPromoted updates draft_sessions.status", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionId = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionId, status: "in_progress" });

  await repository.markDraftSessionPromoted(draftSessionId);

  const { data } = await db.from("draft_sessions").select("status").eq("id", draftSessionId).single();
  assert.equal(data?.status, "promoted");
});

test("db-repository: getTenantByPhoneNumberId returns null for an unknown number", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const lookup = await repository.getTenantByPhoneNumberId(`unknown-${randomUUID()}`);
  assert.equal(lookup, null);
});

test("db-repository: createTenant stores source_draft_session_id, readable via getTenantById", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionId = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionId, status: "promoted" });
  const phoneNumberId = `test-phone-${randomUUID()}`;

  const { tenantId } = await repository.createTenant({
    name: "Test Co",
    phoneNumberId,
    compiledConfig: sampleCompiledConfig(draftSessionId),
    sourceDraftSessionId: draftSessionId,
  });

  const details = await repository.getTenantById(tenantId);
  assert.equal(details?.sourceDraftSessionId, draftSessionId);
  assert.equal(details?.name, "Test Co");
  assert.equal(details?.phoneNumberId, phoneNumberId);
});

test("db-repository: republishTenant publishes a new tenant_configs version live", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionIdV1 = randomUUID();
  const draftSessionIdV2 = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionIdV1, status: "promoted" });
  await db.from("draft_sessions").insert({ id: draftSessionIdV2, status: "promoted" });
  const phoneNumberId = `test-phone-${randomUUID()}`;

  const { tenantId } = await repository.createTenant({
    name: "Test Co",
    phoneNumberId,
    compiledConfig: sampleCompiledConfig(draftSessionIdV1),
    sourceDraftSessionId: draftSessionIdV1,
  });

  const updatedConfig = sampleCompiledConfig(draftSessionIdV2);
  updatedConfig.rootMenu.headerText = "Updated Co! 🎉";
  const { version } = await repository.republishTenant({
    tenantId,
    compiledConfig: updatedConfig,
    sourceDraftSessionId: draftSessionIdV2,
  });
  assert.equal(version, 2);

  const lookup = await repository.getTenantByPhoneNumberId(phoneNumberId);
  assert.match(lookup?.compiledConfig.rootMenu.headerText ?? "", /Updated Co/);
  const details = await repository.getTenantById(tenantId);
  assert.equal(details?.sourceDraftSessionId, draftSessionIdV2);
});

test("db-repository: republishTenant updates tenants.name when name is provided", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionIdV1 = randomUUID();
  const draftSessionIdV2 = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionIdV1, status: "promoted" });
  await db.from("draft_sessions").insert({ id: draftSessionIdV2, status: "promoted" });
  const phoneNumberId = `test-phone-${randomUUID()}`;

  const { tenantId } = await repository.createTenant({
    name: "Test Co",
    phoneNumberId,
    compiledConfig: sampleCompiledConfig(draftSessionIdV1),
    sourceDraftSessionId: draftSessionIdV1,
  });

  await repository.republishTenant({
    tenantId,
    compiledConfig: sampleCompiledConfig(draftSessionIdV2),
    sourceDraftSessionId: draftSessionIdV2,
    name: "Test Co (Renamed)",
  });

  const { data } = await db.from("tenants").select("name").eq("id", tenantId).single();
  assert.equal(data?.name, "Test Co (Renamed)");
});

test("db-repository: createDraftWaBinding -> bindDraftWaBinding -> getBoundDraftByWaId, the full sandbox join loop against a real draft_sessions FK", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionId = randomUUID();
  const waId = `wa-${randomUUID()}`;

  const { error: draftError } = await db.from("draft_sessions").insert({ id: draftSessionId, status: "testing" });
  assert.equal(draftError, null);

  const { token } = await repository.createDraftWaBinding({
    draftSessionId,
    compiledConfig: sampleCompiledConfig(draftSessionId),
    ttlMs: 60_000,
  });
  assert.ok(token);

  const bound = await repository.bindDraftWaBinding(token, waId);
  assert.equal(bound?.draftSessionId, draftSessionId);

  const lookup = await repository.getBoundDraftByWaId(waId);
  assert.equal(lookup?.draftSessionId, draftSessionId);
});

test("db-repository: createDraftWaBinding fails loudly when the referenced draft_sessions row doesn't exist", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  await assert.rejects(() =>
    repository.createDraftWaBinding({
      draftSessionId: randomUUID(), // never inserted
      compiledConfig: sampleCompiledConfig("nope"),
      ttlMs: 60_000,
    }),
  );
});

test("db-repository: bindDraftWaBinding returns null for an expired binding", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionId = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionId, status: "testing" });

  const { token } = await repository.createDraftWaBinding({
    draftSessionId,
    compiledConfig: sampleCompiledConfig(draftSessionId),
    ttlMs: -1000,
  });

  const bound = await repository.bindDraftWaBinding(token, `wa-${randomUUID()}`);
  assert.equal(bound, null);
});

test("db-repository: conversation state upserts idempotently on the composite key", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionId = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionId, status: "testing" });
  const waId = `wa-${randomUUID()}`;

  await repository.upsertConversationState({
    contextType: "draft",
    contextId: draftSessionId,
    waId,
    currentState: "ROOT",
    lastInteraction: new Date().toISOString(),
  });
  await repository.upsertConversationState({
    contextType: "draft",
    contextId: draftSessionId,
    waId,
    currentState: "FAQ_MENU",
    lastInteraction: new Date().toISOString(),
  });

  const state = await repository.getConversationState("draft", draftSessionId, waId);
  assert.equal(state?.currentState, "FAQ_MENU");
});

test("db-repository: chat history insert then status update by message id alone", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionId = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionId, status: "testing" });
  const messageId = `wamid.${randomUUID()}`;

  await repository.insertChatHistory({
    contextType: "draft",
    contextId: draftSessionId,
    waId: `wa-${randomUUID()}`,
    messageId,
    direction: "outbound",
    payload: { hello: "world" },
    status: "sent",
  });

  await repository.updateChatHistoryStatusByMessageId(messageId, "delivered");

  const { data } = await db.from("chat_history").select("status").eq("message_id", messageId).single();
  assert.equal(data?.status, "delivered");
});

test("db-repository: getLastInboundText finds the most recent inbound text message, ignoring outbound and non-text rows", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const draftSessionId = randomUUID();
  await db.from("draft_sessions").insert({ id: draftSessionId, status: "testing" });
  const waId = `wa-${randomUUID()}`;

  assert.equal(await repository.getLastInboundText("draft", draftSessionId, waId), null);

  await repository.insertChatHistory({
    contextType: "draft",
    contextId: draftSessionId,
    waId,
    messageId: `wamid.${randomUUID()}`,
    direction: "inbound",
    payload: { type: "text", text: "Do you ship internationally?" },
    status: "received",
  });
  // an outbound message and a non-text inbound message shouldn't win over the real answer
  await repository.insertChatHistory({
    contextType: "draft",
    contextId: draftSessionId,
    waId,
    messageId: `wamid.${randomUUID()}`,
    direction: "outbound",
    payload: { type: "text", text: "Here's our menu" },
    status: "sent",
  });
  await repository.insertChatHistory({
    contextType: "draft",
    contextId: draftSessionId,
    waId,
    messageId: `wamid.${randomUUID()}`,
    direction: "inbound",
    payload: { type: "interactive", interactiveReplyId: "nav_main_menu" },
    status: "received",
  });

  assert.equal(await repository.getLastInboundText("draft", draftSessionId, waId), "Do you ship internationally?");

  await repository.insertChatHistory({
    contextType: "draft",
    contextId: draftSessionId,
    waId,
    messageId: `wamid.${randomUUID()}`,
    direction: "inbound",
    payload: { type: "text", text: "Actually, what about returns?" },
    status: "received",
  });

  assert.equal(await repository.getLastInboundText("draft", draftSessionId, waId), "Actually, what about returns?");
});

test("db-repository: support ticket + dashboard notification insert against a real tenant", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const phoneNumberId = `test-phone-${randomUUID()}`;
  const { tenantId } = await repository.createTenant({
    name: "Escalation Co",
    phoneNumberId,
    compiledConfig: sampleCompiledConfig("draft-y"),
  });

  const { id: ticketId } = await repository.insertSupportTicket({
    contextType: "tenant",
    contextId: tenantId,
    waId: `wa-${randomUUID()}`,
    summary: "Customer needs help",
  });
  assert.ok(ticketId);

  await repository.insertDashboardNotification({ tenantId, type: "escalation", refId: ticketId });

  const { data } = await db.from("dashboard_notifications").select("*").eq("ref_id", ticketId).maybeSingle();
  assert.equal(data?.type, "escalation");
});

function hold(contextId: string, overrides: Record<string, unknown> = {}) {
  return {
    contextType: "tenant" as const,
    contextId,
    waId: `wa-${randomUUID()}`,
    service: "Haircut",
    provider: "_default",
    startsAt: "2026-09-01T10:00:00.000Z",
    endsAt: "2026-09-01T10:30:00.000Z",
    heldUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...overrides,
  };
}

test("db-repository: createHold persists a real row and rejects a real overlapping hold for the same provider", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const contextId = randomUUID();

  const first = await repository.createHold(hold(contextId));
  assert.ok(first, "expected the first hold on a free slot to succeed");

  const conflict = await repository.createHold(hold(contextId, { startsAt: "2026-09-01T10:15:00.000Z", endsAt: "2026-09-01T10:45:00.000Z" }));
  assert.equal(conflict, null, "an overlapping hold for the same provider must be rejected");
});

test("db-repository: confirmBooking flips a real hold to confirmed and clears held_until", { skip: !hasLiveDb }, async () => {
  const repository = createDbRepository(createDbClient());
  const contextId = randomUUID();

  const record = await repository.createHold(hold(contextId));
  const confirmed = await repository.confirmBooking(record!.id);
  assert.equal(confirmed?.status, "confirmed");
  assert.equal(confirmed?.heldUntil, null);
});

test("db-repository: listActiveBookings only returns real confirmed/live-held rows overlapping the window", { skip: !hasLiveDb }, async () => {
  const repository = createDbRepository(createDbClient());
  const contextId = randomUUID();

  const confirmed = await repository.createHold(hold(contextId, { startsAt: "2026-09-02T09:00:00.000Z", endsAt: "2026-09-02T09:30:00.000Z" }));
  await repository.confirmBooking(confirmed!.id);
  await repository.createHold(hold(contextId, {
    startsAt: "2026-09-02T11:00:00.000Z",
    endsAt: "2026-09-02T11:30:00.000Z",
    heldUntil: new Date(Date.now() - 1000).toISOString(),
  }));

  const active = await repository.listActiveBookings("tenant", contextId, "2026-09-02T00:00:00.000Z", "2026-09-03T00:00:00.000Z");
  assert.equal(active.length, 1);
  assert.equal(active[0]?.status, "confirmed");
});

test("db-repository: listBookingsNeedingReminder finds a real confirmed booking starting soon, and markReminderSent excludes it after", { skip: !hasLiveDb }, async () => {
  const repository = createDbRepository(createDbClient());
  const contextId = randomUUID();
  const startsAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();

  const record = await repository.createHold(hold(contextId, { startsAt, endsAt }));
  await repository.confirmBooking(record!.id);

  const due = await repository.listBookingsNeedingReminder(60 * 60_000, new Date());
  assert.ok(due.some((b) => b.id === record!.id));

  await repository.markReminderSent(record!.id);
  const dueAgain = await repository.listBookingsNeedingReminder(60 * 60_000, new Date());
  assert.ok(!dueAgain.some((b) => b.id === record!.id));
});
