import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompiledConfig } from "@whatsapp-bot-platform/shared-types";
import { createInMemoryRepository } from "./repository.js";
import { handleSandboxJoin, resolveContext } from "./context-resolver.js";

const SANDBOX_NUMBER = "sandbox-phone-number-id";

function fakeCompiledConfig(sourceId: string): CompiledConfig {
  return {
    sourceId,
    version: 1,
    compiledAt: new Date().toISOString(),
    rootMenu: { headerText: "Welcome!", bodyText: "How can we help?", entries: [] },
    stateTable: {},
  };
}

test("resolveContext returns unknown_number for a phone_number_id with no matching tenant", async () => {
  const repository = createInMemoryRepository();
  const result = await resolveContext("some-other-number", "wa-1", SANDBOX_NUMBER, repository);
  assert.deepEqual(result, { kind: "unknown_number" });
});

test("resolveContext resolves a live tenant by phone_number_id", async () => {
  const repository = createInMemoryRepository();
  repository.tenantsByPhoneNumberId.set("tenant-number", {
    tenantId: "tenant-1",
    compiledConfig: fakeCompiledConfig("tenant-1"),
  });

  const result = await resolveContext("tenant-number", "wa-1", SANDBOX_NUMBER, repository);
  assert.equal(result.kind, "resolved");
  assert.equal(result.kind === "resolved" && result.context.contextType, "tenant");
  assert.equal(result.kind === "resolved" && result.context.contextId, "tenant-1");
});

test("resolveContext requires a sandbox join when the wa_id isn't bound yet", async () => {
  const repository = createInMemoryRepository();
  const result = await resolveContext(SANDBOX_NUMBER, "wa-1", SANDBOX_NUMBER, repository);
  assert.deepEqual(result, { kind: "sandbox_join_required" });
});

test("resolveContext resolves a draft context once a wa_id is bound to a sandbox binding", async () => {
  const repository = createInMemoryRepository();
  repository.draftsBySessionId.set("draft-1", fakeCompiledConfig("draft-1"));
  repository.waBindings.set("tok-123", {
    token: "tok-123",
    draftSessionId: "draft-1",
    waId: "wa-1",
    status: "bound",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await resolveContext(SANDBOX_NUMBER, "wa-1", SANDBOX_NUMBER, repository);
  assert.equal(result.kind, "resolved");
  assert.equal(result.kind === "resolved" && result.context.contextType, "draft");
  assert.equal(result.kind === "resolved" && result.context.contextId, "draft-1");
});

test("handleSandboxJoin binds a pending token to the sender's wa_id", async () => {
  const repository = createInMemoryRepository();
  repository.draftsBySessionId.set("draft-1", fakeCompiledConfig("draft-1"));
  repository.waBindings.set("tok-123", {
    token: "tok-123",
    draftSessionId: "draft-1",
    waId: null,
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await handleSandboxJoin("JOIN tok-123", "wa-1", repository);
  assert.equal(result.joined, true);
  assert.equal(result.context?.contextId, "draft-1");
  assert.equal(repository.waBindings.get("tok-123")?.status, "bound");
});

test("handleSandboxJoin fails for an unknown or expired token", async () => {
  const repository = createInMemoryRepository();
  const missing = await handleSandboxJoin("JOIN nope", "wa-1", repository);
  assert.equal(missing.joined, false);

  repository.waBindings.set("tok-expired", {
    token: "tok-expired",
    draftSessionId: "draft-1",
    waId: null,
    status: "pending",
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const expired = await handleSandboxJoin("JOIN tok-expired", "wa-1", repository);
  assert.equal(expired.joined, false);
});

test("handleSandboxJoin does not treat ordinary text as a join command", async () => {
  const repository = createInMemoryRepository();
  const result = await handleSandboxJoin("Hi, I want to see the menu", "wa-1", repository);
  assert.equal(result.joined, false);
});
