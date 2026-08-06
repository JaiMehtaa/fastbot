import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDbClient } from "@whatsapp-bot-platform/db";
import { getPromptTemplate, setPromptTemplate, resetPromptTemplate, listPromptTemplates } from "./store.js";
import { createPromptTemplateResolver } from "./resolver.js";

/**
 * Real integration tests against a live Postgres instance — see
 * apps/runtime/src/db-repository.test.ts for why these skip rather than
 * fail when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set. DbClient is
 * the real SupabaseClient<Database> type (not a small hand-rollable
 * interface), same reason apps/interview-api's db-session-store.test.ts has
 * no fake-based unit tests either — this table's read/write/cache behavior
 * is only meaningfully tested against the real thing.
 */
const hasLiveDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

test("getPromptTemplate returns null for a key with no override", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const value = await getPromptTemplate(db, `test_key_${randomUUID()}`);
  assert.equal(value, null);
});

test("setPromptTemplate then getPromptTemplate round-trips the override", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const key = `test_key_${randomUUID()}`;
  await setPromptTemplate(db, key, "Be extra warm and enthusiastic.");
  const value = await getPromptTemplate(db, key);
  assert.equal(value, "Be extra warm and enthusiastic.");
});

test("setPromptTemplate twice updates the same row, not a duplicate", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const key = `test_key_${randomUUID()}`;
  await setPromptTemplate(db, key, "first version");
  await setPromptTemplate(db, key, "second version");
  const value = await getPromptTemplate(db, key);
  assert.equal(value, "second version");
});

test("resetPromptTemplate removes the override, falling back to null again", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const key = `test_key_${randomUUID()}`;
  await setPromptTemplate(db, key, "temporary override");
  await resetPromptTemplate(db, key);
  const value = await getPromptTemplate(db, key);
  assert.equal(value, null);
});

test("listPromptTemplates reports isOverridden correctly and falls back to the given default", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const overriddenKey = `test_key_${randomUUID()}`;
  const plainKey = `test_key_${randomUUID()}`;
  await setPromptTemplate(db, overriddenKey, "custom instructions");

  const summaries = await listPromptTemplates(db, { [overriddenKey]: "default A", [plainKey]: "default B" });
  const overridden = summaries.find((s) => s.key === overriddenKey);
  const plain = summaries.find((s) => s.key === plainKey);

  assert.equal(overridden?.isOverridden, true);
  assert.equal(overridden?.effectiveTemplate, "custom instructions");
  assert.equal(overridden?.defaultTemplate, "default A");

  assert.equal(plain?.isOverridden, false);
  assert.equal(plain?.effectiveTemplate, "default B");
});

test("resolver returns the override when present, and the fallback when absent", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const overriddenKey = `test_key_${randomUUID()}`;
  const plainKey = `test_key_${randomUUID()}`;
  await setPromptTemplate(db, overriddenKey, "custom");

  const overriddenResolve = createPromptTemplateResolver(db, overriddenKey, "fallback text");
  assert.equal(await overriddenResolve(), "custom");

  const plainResolve = createPromptTemplateResolver(db, plainKey, "fallback text");
  assert.equal(await plainResolve(), "fallback text");
});

test("resolver caches within the TTL and refetches after it expires", { skip: !hasLiveDb }, async () => {
  const db = createDbClient();
  const key = `test_key_${randomUUID()}`;
  await setPromptTemplate(db, key, "version A");

  const resolve = createPromptTemplateResolver(db, key, "fallback", 100);
  assert.equal(await resolve(), "version A");

  await setPromptTemplate(db, key, "version B");
  // still within the 100ms TTL -> stale cached value
  assert.equal(await resolve(), "version A");

  await new Promise((r) => setTimeout(r, 150));
  // TTL expired -> refetches and picks up the new value
  assert.equal(await resolve(), "version B");
});
