import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRepository } from "./repository.js";

test("insertChatHistory then updateChatHistoryStatusByMessageId updates the matching entry by message id alone", async () => {
  const repository = createInMemoryRepository();
  await repository.insertChatHistory({
    contextType: "tenant",
    contextId: "tenant-1",
    waId: "wa-1",
    messageId: "wamid.abc",
    direction: "outbound",
    payload: {},
    status: "sent",
  });

  await repository.updateChatHistoryStatusByMessageId("wamid.abc", "delivered");

  assert.equal(repository.chatHistory[0]?.status, "delivered");
});

test("updateChatHistoryStatusByMessageId is a no-op for an unknown message id", async () => {
  const repository = createInMemoryRepository();
  await assert.doesNotReject(() => repository.updateChatHistoryStatusByMessageId("no-such-id", "delivered"));
});

test("getDraftWaBinding returns the stored binding or null", async () => {
  const repository = createInMemoryRepository();
  assert.equal(await repository.getDraftWaBinding("missing"), null);

  repository.waBindings.set("tok-1", {
    token: "tok-1",
    draftSessionId: "draft-1",
    waId: null,
    status: "pending",
    expiresAt: new Date().toISOString(),
  });
  const binding = await repository.getDraftWaBinding("tok-1");
  assert.equal(binding?.draftSessionId, "draft-1");
});
