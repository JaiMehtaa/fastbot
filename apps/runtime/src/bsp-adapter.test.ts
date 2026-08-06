import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockBspAdapter } from "./bsp-adapter.js";
import { buildButtonMessage } from "./whatsapp-payload.js";

const SAMPLE_MESSAGE = buildButtonMessage("919999999999", "Hi", "How can we help?", [{ id: "a", title: "A" }]);

test("createMockBspAdapter assigns a distinct messageId per send within one instance", async () => {
  const adapter = createMockBspAdapter();
  const first = await adapter.send(SAMPLE_MESSAGE);
  const second = await adapter.send(SAMPLE_MESSAGE);
  assert.notEqual(first.messageId, second.messageId);
});

test("two separately-created adapters (simulating two process restarts) never produce colliding messageIds", async () => {
  // Regression test: messageId used to be a sequential per-instance counter
  // (mock-msg-1, mock-msg-2, ...) that always restarted at 1 — fine within
  // one process, but chat_history's real uniqueness constraint is scoped
  // per tenant, not per process, and createDbRepository persists across
  // restarts. Found live: restarting apps/runtime's dev server against an
  // already-used tenant immediately collided on "mock-msg-1".
  const processA = createMockBspAdapter();
  const processB = createMockBspAdapter();

  const fromA = await processA.send(SAMPLE_MESSAGE);
  const fromB = await processB.send(SAMPLE_MESSAGE);

  assert.notEqual(fromA.messageId, fromB.messageId);
});
