import { test } from "node:test";
import assert from "node:assert/strict";
import { runReminderSweep } from "./reminder-sweep.js";
import { createInMemoryRepository } from "./repository.js";
import { createMockBspAdapter } from "./bsp-adapter.js";

function hold(overrides: Record<string, unknown> = {}) {
  return {
    contextType: "tenant" as const,
    contextId: "tenant-1",
    waId: "919999999999",
    service: "Haircut",
    provider: "_default",
    startsAt: "2026-08-10T10:00:00.000Z",
    endsAt: "2026-08-10T10:30:00.000Z",
    heldUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...overrides,
  };
}

test("sends a reminder for a confirmed booking starting within the window and marks it sent", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const now = new Date("2026-08-10T09:00:00.000Z");
  const record = await repository.createHold(hold({ startsAt: "2026-08-10T09:30:00.000Z", endsAt: "2026-08-10T10:00:00.000Z" }));
  await repository.confirmBooking(record!.id);

  const result = await runReminderSweep(repository, bspAdapter, 60 * 60_000, now);

  assert.equal(result.remindersSent, 1);
  assert.equal(result.failures, 0);
  assert.equal(bspAdapter.sentMessages.length, 1);
  assert.match((bspAdapter.sentMessages[0] as { interactive: { body: { text: string } } }).interactive.body.text, /Haircut/);
  assert.ok(repository.bookings[0]?.reminderSentAt);
});

test("does not remind a booking outside the window", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const now = new Date("2026-08-10T09:00:00.000Z");
  const record = await repository.createHold(hold({ startsAt: "2026-08-12T09:30:00.000Z", endsAt: "2026-08-12T10:00:00.000Z" }));
  await repository.confirmBooking(record!.id);

  const result = await runReminderSweep(repository, bspAdapter, 60 * 60_000, now);
  assert.equal(result.remindersSent, 0);
  assert.equal(bspAdapter.sentMessages.length, 0);
});

test("does not remind a booking twice, even across repeated sweeps", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const now = new Date("2026-08-10T09:00:00.000Z");
  const record = await repository.createHold(hold({ startsAt: "2026-08-10T09:30:00.000Z", endsAt: "2026-08-10T10:00:00.000Z" }));
  await repository.confirmBooking(record!.id);

  await runReminderSweep(repository, bspAdapter, 60 * 60_000, now);
  const second = await runReminderSweep(repository, bspAdapter, 60 * 60_000, now);

  assert.equal(second.remindersSent, 0);
  assert.equal(bspAdapter.sentMessages.length, 1);
});

test("a still-held (never confirmed) booking is never reminded", async () => {
  const repository = createInMemoryRepository();
  const bspAdapter = createMockBspAdapter();
  const now = new Date("2026-08-10T09:00:00.000Z");
  await repository.createHold(hold({ startsAt: "2026-08-10T09:30:00.000Z", endsAt: "2026-08-10T10:00:00.000Z" }));

  const result = await runReminderSweep(repository, bspAdapter, 60 * 60_000, now);
  assert.equal(result.remindersSent, 0);
});

test("one booking's send failure doesn't stop the rest of the sweep from being reminded", async () => {
  const repository = createInMemoryRepository();
  const now = new Date("2026-08-10T09:00:00.000Z");
  const failing = await repository.createHold(hold({ waId: "bad-wa-id", startsAt: "2026-08-10T09:15:00.000Z", endsAt: "2026-08-10T09:45:00.000Z" }));
  await repository.confirmBooking(failing!.id);
  const ok = await repository.createHold(hold({ waId: "919999999999", startsAt: "2026-08-10T09:45:00.000Z", endsAt: "2026-08-10T10:15:00.000Z" }));
  await repository.confirmBooking(ok!.id);

  const flakyAdapter = {
    sentMessages: [] as unknown[],
    async send(message: { to: string }) {
      if (message.to === "bad-wa-id") throw new Error("simulated BSP failure");
      flakyAdapter.sentMessages.push(message);
      return { messageId: "mock-1" };
    },
  };

  const result = await runReminderSweep(repository, flakyAdapter, 60 * 60_000, now);
  assert.equal(result.remindersSent, 1);
  assert.equal(result.failures, 1);
  assert.equal(flakyAdapter.sentMessages.length, 1);
  // the failed one stays unreminded so a later sweep can retry it
  assert.equal(repository.bookings.find((b) => b.id === failing!.id)?.reminderSentAt, null);
});
