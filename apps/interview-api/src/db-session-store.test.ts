import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDbClient } from "@whatsapp-bot-platform/db";
import { createDbSessionStore } from "./db-session-store.js";

/**
 * Real integration tests against a live Postgres instance — see
 * apps/runtime/src/db-repository.test.ts for why these skip rather than
 * fail when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set.
 */
const hasLiveDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

test("db-session-store: get() on an unknown draftSessionId returns undefined, same as the in-memory store", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const store = createDbSessionStore(db);
  const state = await store.get(randomUUID());
  assert.equal(state, undefined);
});

test("db-session-store: set() then get() round-trips every field of InterviewSessionState", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const store = createDbSessionStore(db);
  const draftSessionId = randomUUID();

  await store.set(draftSessionId, {
    draftSessionId,
    lobKey: "retail_d2c",
    lobAmbiguityAsked: true,
    selectedPrimitives: ["business_info", "catalogue", "faq_support", "human_escalation"],
    fieldValues: { business_info: { business_name: "Meadow Soaps" } },
    confirmed: false,
  });

  const state = await store.get(draftSessionId);
  assert.equal(state?.lobKey, "retail_d2c");
  assert.equal(state?.lobAmbiguityAsked, true);
  assert.deepEqual(state?.selectedPrimitives, ["business_info", "catalogue", "faq_support", "human_escalation"]);
  assert.deepEqual(state?.fieldValues, { business_info: { business_name: "Meadow Soaps" } });
  assert.equal(state?.confirmed, false);
});

test("db-session-store: repeated set() calls update the same session in place, not accumulate duplicate rows", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const store = createDbSessionStore(db);
  const draftSessionId = randomUUID();

  await store.set(draftSessionId, {
    draftSessionId,
    lobKey: null,
    lobAmbiguityAsked: false,
    selectedPrimitives: [],
    fieldValues: {},
    confirmed: false,
  });
  await store.set(draftSessionId, {
    draftSessionId,
    lobKey: "minimal_support",
    lobAmbiguityAsked: false,
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: { business_info: { business_name: "Test Co" } },
    confirmed: true,
  });

  const state = await store.get(draftSessionId);
  assert.equal(state?.lobKey, "minimal_support");
  assert.equal(state?.confirmed, true);

  const { data, error } = await db.from("draft_configs").select("id").eq("draft_session_id", draftSessionId);
  assert.equal(error, null);
  assert.equal(data?.length, 1);
});
