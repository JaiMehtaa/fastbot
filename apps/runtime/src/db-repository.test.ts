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

test("db-repository: getTenantByPhoneNumberId returns null for an unknown number", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const repository = createDbRepository(db);
  const lookup = await repository.getTenantByPhoneNumberId(`unknown-${randomUUID()}`);
  assert.equal(lookup, null);
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
