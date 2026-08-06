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

test("createTenant registers a tenant lookup by phone_number_id", async () => {
  const repository = createInMemoryRepository();
  const compiledConfig = {
    sourceId: "draft-1",
    version: 1,
    compiledAt: new Date().toISOString(),
    rootMenu: { headerText: "hi", bodyText: "hi", entries: [] },
    stateTable: {},
  };

  const { tenantId } = await repository.createTenant({ name: "Meadow Soaps", phoneNumberId: "phone-1", compiledConfig });

  const lookup = await repository.getTenantByPhoneNumberId("phone-1");
  assert.equal(lookup?.tenantId, tenantId);
  assert.equal(lookup?.compiledConfig, compiledConfig);
});

test("createTenant records the source draft session id, retrievable via getTenantById", async () => {
  const repository = createInMemoryRepository();
  const compiledConfig = {
    sourceId: "draft-1",
    version: 1,
    compiledAt: new Date().toISOString(),
    rootMenu: { headerText: "hi", bodyText: "hi", entries: [] },
    stateTable: {},
  };

  const { tenantId } = await repository.createTenant({
    name: "Meadow Soaps",
    phoneNumberId: "phone-1",
    compiledConfig,
    sourceDraftSessionId: "draft-1",
  });

  const details = await repository.getTenantById(tenantId);
  assert.equal(details?.sourceDraftSessionId, "draft-1");
  assert.equal(details?.name, "Meadow Soaps");
  assert.equal(details?.phoneNumberId, "phone-1");
});

test("republishTenant publishes a new version and updates the phone_number_id lookup", async () => {
  const repository = createInMemoryRepository();
  const compiledConfigV1 = {
    sourceId: "draft-1",
    version: 1,
    compiledAt: new Date().toISOString(),
    rootMenu: { headerText: "v1", bodyText: "hi", entries: [] },
    stateTable: {},
  };
  const compiledConfigV2 = { ...compiledConfigV1, rootMenu: { ...compiledConfigV1.rootMenu, headerText: "v2" } };

  const { tenantId } = await repository.createTenant({
    name: "Meadow Soaps",
    phoneNumberId: "phone-1",
    compiledConfig: compiledConfigV1,
    sourceDraftSessionId: "draft-1",
  });

  const { version } = await repository.republishTenant({
    tenantId,
    compiledConfig: compiledConfigV2,
    sourceDraftSessionId: "draft-2",
  });

  assert.equal(version, 2);
  const lookup = await repository.getTenantByPhoneNumberId("phone-1");
  assert.equal(lookup?.compiledConfig.rootMenu.headerText, "v2");
  const details = await repository.getTenantById(tenantId);
  assert.equal(details?.sourceDraftSessionId, "draft-2");
});

test("republishTenant updates tenants.name when name is provided, leaves it alone otherwise", async () => {
  const repository = createInMemoryRepository();
  const compiledConfig = {
    sourceId: "draft-1",
    version: 1,
    compiledAt: new Date().toISOString(),
    rootMenu: { headerText: "hi", bodyText: "hi", entries: [] },
    stateTable: {},
  };

  const { tenantId } = await repository.createTenant({
    name: "Meadow Soaps",
    phoneNumberId: "phone-1",
    compiledConfig,
    sourceDraftSessionId: "draft-1",
  });

  await repository.republishTenant({ tenantId, compiledConfig, sourceDraftSessionId: "draft-2", name: "Meadow Soaps & Co." });
  let details = await repository.getTenantById(tenantId);
  assert.equal(details?.name, "Meadow Soaps & Co.");

  await repository.republishTenant({ tenantId, compiledConfig, sourceDraftSessionId: "draft-3" });
  details = await repository.getTenantById(tenantId);
  assert.equal(details?.name, "Meadow Soaps & Co.");
});

test("createDraftWaBinding issues a distinct, pending, unexpired token per call", async () => {
  const repository = createInMemoryRepository();
  const compiledConfig = {
    sourceId: "draft-1",
    version: 1,
    compiledAt: new Date().toISOString(),
    rootMenu: { headerText: "hi", bodyText: "hi", entries: [] },
    stateTable: {},
  };

  const first = await repository.createDraftWaBinding({ draftSessionId: "draft-1", compiledConfig, ttlMs: 60_000 });
  const second = await repository.createDraftWaBinding({ draftSessionId: "draft-1", compiledConfig, ttlMs: 60_000 });

  assert.notEqual(first.token, second.token);
  const binding = await repository.getDraftWaBinding(first.token);
  assert.equal(binding?.status, "pending");
  assert.equal(binding?.waId, null);
  assert.ok(new Date(binding!.expiresAt).getTime() > Date.now());
});

function hold(overrides: Partial<Parameters<ReturnType<typeof createInMemoryRepository>["createHold"]>[0]> = {}) {
  return {
    contextType: "tenant" as const,
    contextId: "tenant-1",
    waId: "wa-1",
    service: "Haircut",
    provider: "_default",
    startsAt: "2026-08-10T10:00:00.000Z",
    endsAt: "2026-08-10T10:30:00.000Z",
    heldUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...overrides,
  };
}

test("createHold succeeds for a genuinely free slot", async () => {
  const repository = createInMemoryRepository();
  const record = await repository.createHold(hold());
  assert.ok(record);
  assert.equal(record?.status, "held");
  assert.equal(repository.bookings.length, 1);
});

test("createHold rejects an overlapping slot for the same provider while a hold is still active", async () => {
  const repository = createInMemoryRepository();
  await repository.createHold(hold());
  // overlaps the first booking's 10:00-10:30 window
  const conflict = await repository.createHold(hold({ startsAt: "2026-08-10T10:15:00.000Z", endsAt: "2026-08-10T10:45:00.000Z" }));
  assert.equal(conflict, null);
});

test("createHold allows the same time slot for a different provider", async () => {
  const repository = createInMemoryRepository();
  await repository.createHold(hold({ provider: "Priya" }));
  const other = await repository.createHold(hold({ provider: "Arjun" }));
  assert.ok(other, "a different provider's identical slot should not conflict");
});

test("createHold allows re-booking a slot whose hold already expired — an expired hold is treated as free", async () => {
  const repository = createInMemoryRepository();
  await repository.createHold(hold({ heldUntil: new Date(Date.now() - 1000).toISOString() }));
  const second = await repository.createHold(hold());
  assert.ok(second, "an expired hold must not block a new hold on the same slot");
});

test("confirmBooking flips a live hold to confirmed and clears heldUntil", async () => {
  const repository = createInMemoryRepository();
  const record = await repository.createHold(hold());
  const confirmed = await repository.confirmBooking(record!.id);
  assert.equal(confirmed?.status, "confirmed");
  assert.equal(confirmed?.heldUntil, null);
});

test("confirmBooking returns null for an already-expired hold", async () => {
  const repository = createInMemoryRepository();
  const record = await repository.createHold(hold({ heldUntil: new Date(Date.now() + 1000).toISOString() }));
  repository.bookings[0]!.heldUntil = new Date(Date.now() - 1000).toISOString();
  const confirmed = await repository.confirmBooking(record!.id);
  assert.equal(confirmed, null);
});

test("a confirmed booking now blocks a new hold on the same slot, even with no active hold expiry", async () => {
  const repository = createInMemoryRepository();
  const record = await repository.createHold(hold());
  await repository.confirmBooking(record!.id);
  const conflict = await repository.createHold(hold());
  assert.equal(conflict, null);
});

test("listActiveBookings only returns confirmed or live-held bookings overlapping the requested window", async () => {
  const repository = createInMemoryRepository();
  const confirmed = await repository.createHold(hold({ startsAt: "2026-08-10T09:00:00.000Z", endsAt: "2026-08-10T09:30:00.000Z" }));
  await repository.confirmBooking(confirmed!.id);
  await repository.createHold({ ...hold({ startsAt: "2026-08-10T11:00:00.000Z", endsAt: "2026-08-10T11:30:00.000Z" }), heldUntil: new Date(Date.now() - 1000).toISOString() });

  const active = await repository.listActiveBookings("tenant", "tenant-1", "2026-08-10T00:00:00.000Z", "2026-08-11T00:00:00.000Z");
  assert.equal(active.length, 1);
  assert.equal(active[0]?.status, "confirmed");
});

test("listBookingsNeedingReminder returns confirmed bookings starting within the window that haven't been reminded yet", async () => {
  const repository = createInMemoryRepository();
  const now = new Date("2026-08-10T09:00:00.000Z");
  const soon = await repository.createHold(hold({ startsAt: "2026-08-10T09:30:00.000Z", endsAt: "2026-08-10T10:00:00.000Z" }));
  await repository.confirmBooking(soon!.id);
  const farAway = await repository.createHold(hold({ startsAt: "2026-08-12T09:30:00.000Z", endsAt: "2026-08-12T10:00:00.000Z" }));
  await repository.confirmBooking(farAway!.id);

  const due = await repository.listBookingsNeedingReminder(60 * 60_000, now);
  assert.equal(due.length, 1);
  assert.equal(due[0]?.id, soon!.id);

  await repository.markReminderSent(soon!.id);
  const dueAgain = await repository.listBookingsNeedingReminder(60 * 60_000, now);
  assert.equal(dueAgain.length, 0);
});
