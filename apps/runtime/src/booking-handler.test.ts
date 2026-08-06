import { test } from "node:test";
import assert from "node:assert/strict";
import { createBookingHandler } from "./handlers/booking.js";
import { createInMemoryRepository } from "./repository.js";
import type { HandlerInput } from "./handlers/types.js";
import type { WhatsAppOutboundButtonMessage, WhatsAppOutboundListMessage } from "./whatsapp-payload.js";

const CONTEXT = { contextType: "tenant" as const, contextId: "tenant-1" };

// every day open, full 24h, so "today" (dayOffset 0) is always open and always has future
// slots left regardless of what real-world time these tests actually run at
const ALL_DAY_HOURS = Object.fromEntries(
  ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((d) => [d, "00:00-23:59"]),
);

function handlerArgs(overrides: Record<string, unknown> = {}) {
  return {
    services: [{ name: "Haircut", durationMinutes: 30 }, { name: "Color", durationMinutes: 90, price: 2000 }],
    providers: [],
    slotGranularityMinutes: 30,
    bookingWindowDays: 14,
    businessHours: ALL_DAY_HOURS,
    ...overrides,
  };
}

function input(replyId: string | undefined, args: Record<string, unknown>): HandlerInput {
  return {
    waId: "wa-1",
    currentState: "BOOKING_SELECT_SERVICE",
    message: { waId: "wa-1", messageId: `m-${Math.random()}`, type: "interactive", interactiveReplyId: replyId, receivedAt: new Date().toISOString() },
    stateEntry: { primitiveKey: "booking", handlerArgs: args },
    context: CONTEXT,
  };
}

test("default entry renders the service list with a Main Menu row", async () => {
  const handler = createBookingHandler(createInMemoryRepository());
  const result = await handler(input(undefined, handlerArgs()));
  assert.equal(result.nextState, "BOOKING_SELECT_SERVICE");
  const rows = (result.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  assert.equal(rows.length, 3); // 2 services + main menu
  assert.ok(rows.some((r) => r.id === "nav_main_menu"));
  assert.match(rows[0]?.title ?? "", /Haircut/);
});

test("nav_main_menu returns to ROOT from any point in the flow", async () => {
  const handler = createBookingHandler(createInMemoryRepository());
  const result = await handler(input("nav_main_menu", handlerArgs()));
  assert.deepEqual(result, { nextState: "ROOT" });
});

test("picking a service with no providers configured skips straight to date selection", async () => {
  const handler = createBookingHandler(createInMemoryRepository());
  const result = await handler(input("booking_svc_0", handlerArgs()));
  assert.equal(result.nextState, "BOOKING_SELECT_DATE");
  const rows = (result.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  assert.ok(rows.some((r) => r.id.startsWith("booking_date_0_-1_")));
});

test("picking a service with providers configured asks who first", async () => {
  const args = handlerArgs({ providers: [{ name: "Priya" }, { name: "Arjun" }] });
  const handler = createBookingHandler(createInMemoryRepository());
  const result = await handler(input("booking_svc_0", args));
  assert.equal(result.nextState, "BOOKING_SELECT_PROVIDER");
  const rows = (result.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  assert.ok(rows.some((r) => r.id === "booking_prov_0_0" && r.title === "Priya"));

  const dateResult = await handler(input("booking_prov_0_1", args));
  assert.equal(dateResult.nextState, "BOOKING_SELECT_DATE");
  const dateRows = (dateResult.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  assert.ok(dateRows.some((r) => r.id.startsWith("booking_date_0_1_")));
});

test("picking today's date renders real available times for that service's duration", async () => {
  const handler = createBookingHandler(createInMemoryRepository());
  const result = await handler(input("booking_date_0_-1_0", handlerArgs()));
  assert.equal(result.nextState, "BOOKING_SELECT_TIME");
  const rows = (result.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  assert.ok(rows.length > 1, "expected multiple time slots plus the main menu row");
  assert.ok(rows.some((r) => r.id === "nav_main_menu"));
});

test("an already-booked time is excluded from the rendered list for that provider", async () => {
  const repository = createInMemoryRepository();
  const handler = createBookingHandler(repository);

  // book the very first available slot for Haircut today
  const first = await handler(input("booking_date_0_-1_0", handlerArgs()));
  const firstSlotId = (first.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;
  const held = await handler(input(firstSlotId, handlerArgs()));
  assert.equal(held.nextState, "BOOKING_CONFIRM");
  const holdId = (held.outboundPayload as WhatsAppOutboundButtonMessage).interactive.action.buttons[0]?.reply.id.replace("booking_confirm_yes_", "");
  await repository.confirmBooking(holdId!);

  // re-render the time list — the just-booked slot must be gone
  const again = await handler(input("booking_date_0_-1_0", handlerArgs()));
  const rowsAgain = (again.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  assert.ok(!rowsAgain.some((r) => r.id === firstSlotId), "the booked slot must not be offered again");
});

test("holding a slot creates a real held booking and renders a confirm step", async () => {
  const repository = createInMemoryRepository();
  const handler = createBookingHandler(repository);
  const timeList = await handler(input("booking_date_0_-1_0", handlerArgs()));
  const slotId = (timeList.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;

  const result = await handler(input(slotId, handlerArgs()));
  assert.equal(result.nextState, "BOOKING_CONFIRM");
  assert.equal(repository.bookings.length, 1);
  assert.equal(repository.bookings[0]?.status, "held");
  assert.equal(repository.bookings[0]?.service, "Haircut");

  const buttons = (result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.action.buttons;
  assert.ok(buttons.some((b) => b.reply.id.startsWith("booking_confirm_yes_")));
  assert.ok(buttons.some((b) => b.reply.id.startsWith("booking_confirm_no_")));
});

test("confirming yes flips the hold to confirmed and ends the flow at ROOT", async () => {
  const repository = createInMemoryRepository();
  const handler = createBookingHandler(repository);
  const timeList = await handler(input("booking_date_0_-1_0", handlerArgs()));
  const slotId = (timeList.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;
  const held = await handler(input(slotId, handlerArgs()));
  const holdId = repository.bookings[0]!.id;

  const result = await handler(input(`booking_confirm_yes_${holdId}`, handlerArgs()));
  assert.equal(result.nextState, "ROOT");
  assert.ok(result.outboundPayload, "expected a confirmation message, not a silent handoff");
  assert.equal(repository.bookings[0]?.status, "confirmed");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /Haircut/);
  void held;
});

test("confirming no cancels the hold and frees the slot", async () => {
  const repository = createInMemoryRepository();
  const handler = createBookingHandler(repository);
  const timeList = await handler(input("booking_date_0_-1_0", handlerArgs()));
  const slotId = (timeList.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;
  await handler(input(slotId, handlerArgs()));
  const holdId = repository.bookings[0]!.id;

  const result = await handler(input(`booking_confirm_no_${holdId}`, handlerArgs()));
  assert.equal(result.nextState, "ROOT");
  assert.equal(repository.bookings[0]?.status, "cancelled");

  // the slot should be bookable again immediately
  const retry = await handler(input(slotId, handlerArgs()));
  assert.equal(retry.nextState, "BOOKING_CONFIRM");
});

test("confirming an expired hold reports it clearly rather than silently failing", async () => {
  const repository = createInMemoryRepository();
  const handler = createBookingHandler(repository);
  const timeList = await handler(input("booking_date_0_-1_0", handlerArgs()));
  const slotId = (timeList.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;
  await handler(input(slotId, handlerArgs()));
  const bookingId = repository.bookings[0]!.id;
  repository.bookings[0]!.heldUntil = new Date(Date.now() - 1000).toISOString(); // force-expire it

  const result = await handler(input(`booking_confirm_yes_${bookingId}`, handlerArgs()));
  assert.equal(result.nextState, "ROOT");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /expired/i);
});

test("a slot grabbed by someone else between rendering and tapping is reported, not silently double-booked", async () => {
  const repository = createInMemoryRepository();
  const handler = createBookingHandler(repository);
  const timeList = await handler(input("booking_date_0_-1_0", handlerArgs()));
  const slotId = (timeList.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;

  // someone else takes the exact same slot first
  const first = await handler(input(slotId, handlerArgs()));
  assert.equal(first.nextState, "BOOKING_CONFIRM");
  assert.equal(repository.bookings.length, 1);

  // the original customer's tap on the now-stale list arrives second — caught here by the slot no
  // longer appearing in freshly-recomputed availability (repository.createHold's own conflict
  // check is the deeper backstop for a true simultaneous race, exercised separately at the
  // repository level in repository.test.ts) — either path must refuse a second booking
  const second = await handler(input(slotId, handlerArgs()));
  assert.equal(second.nextState, "BOOKING_SELECT_TIME");
  assert.match((second.outboundPayload as WhatsAppOutboundListMessage).interactive.body.text, /no longer available|just grabbed/i);
  assert.equal(repository.bookings.length, 1, "the second attempt must not create a second booking for the same slot");
});

test("a business with no open hours at all gets a clear message instead of an empty date list", async () => {
  const closedAllWeek = Object.fromEntries(
    ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((d) => [d, "closed"]),
  );
  const handler = createBookingHandler(createInMemoryRepository());
  const result = await handler(input("booking_svc_0", handlerArgs({ businessHours: closedAllWeek })));
  assert.equal(result.nextState, "ROOT");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /open hours/i);
});

test("an unrecognized reply id falls back to rendering the service list, matching every other primitive's default", async () => {
  const handler = createBookingHandler(createInMemoryRepository());
  const result = await handler(input("some_garbage_reply", handlerArgs()));
  assert.equal(result.nextState, "BOOKING_SELECT_SERVICE");
});
