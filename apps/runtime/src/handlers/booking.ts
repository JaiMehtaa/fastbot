import { MAIN_MENU_BUTTON, buildButtonMessage, buildListMessage } from "../whatsapp-payload.js";
import type { HandlerInput, HandlerOutput } from "./types.js";
import type { RuntimeRepository } from "../repository.js";

export type BookingRepository = Pick<RuntimeRepository, "listActiveBookings" | "createHold" | "confirmBooking" | "cancelBooking">;

interface Service {
  name: string;
  durationMinutes: number;
  price?: number;
}

interface Provider {
  name: string;
}

const NO_PROVIDER = -1;
const HOLD_DURATION_MS = 5 * 60_000;
const MAX_LIST_ITEMS = 9;

/**
 * Every step's selection is encoded directly into the next step's reply
 * ids — service index, provider index (NO_PROVIDER when the business has
 * none), day offset, slot index — so this handler stays a pure function of
 * (currentState-independent) reply id + static handlerArgs + one live
 * repository read/write, exactly like every other primitive's handler.
 * There's deliberately no server-side scratch memory for "what did the
 * customer pick two turns ago": the reply id chain already carries it.
 */
function encodeService(serviceIndex: number): string {
  return `booking_svc_${serviceIndex}`;
}
function encodeProvider(serviceIndex: number, providerIndex: number): string {
  return `booking_prov_${serviceIndex}_${providerIndex}`;
}
function encodeDate(serviceIndex: number, providerIndex: number, dayOffset: number): string {
  return `booking_date_${serviceIndex}_${providerIndex}_${dayOffset}`;
}
function encodeTime(serviceIndex: number, providerIndex: number, dayOffset: number, slotIndex: number): string {
  return `booking_time_${serviceIndex}_${providerIndex}_${dayOffset}_${slotIndex}`;
}

function parseInts(replyId: string, prefix: string): number[] | null {
  if (!replyId.startsWith(prefix)) return null;
  const parts = replyId.slice(prefix.length).split("_").map(Number);
  return parts.every((n) => Number.isInteger(n)) ? parts : null;
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DayHours {
  startMinutes: number;
  endMinutes: number;
}

/**
 * Best-effort parser for the free-text ranges business_info.hours already
 * contains (e.g. "9am-6pm", "09:00-18:00", "closed") — not exhaustive, a
 * range this can't parse is simply treated as "closed that day" rather
 * than guessed at or thrown on.
 */
function parseHoursRange(value: string): DayHours | null {
  if (/closed/i.test(value)) return null;
  const match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(value);
  if (!match) return null;
  const [, h1, m1, ap1, h2, m2, ap2] = match;

  const toMinutes = (hourStr: string, minuteStr: string | undefined, ampm: string | undefined, defaultPeriod: "am" | "pm"): number => {
    let hour = Number(hourStr);
    const minute = minuteStr ? Number(minuteStr) : 0;
    if (hour <= 12) {
      const period = (ampm ?? defaultPeriod).toLowerCase();
      if (period === "pm" && hour !== 12) hour += 12;
      if (period === "am" && hour === 12) hour = 0;
    }
    return hour * 60 + minute;
  };

  const startMinutes = toMinutes(h1!, m1, ap1, "am");
  const endMinutes = toMinutes(h2!, m2, ap2, "pm");
  if (endMinutes <= startMinutes) return null;
  return { startMinutes, endMinutes };
}

function formatTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

function formatDateLabel(date: Date): string {
  return `${WEEKDAY_LABELS[date.getUTCDay()]}, ${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function dayStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

interface OpenDay {
  dayOffset: number;
  date: Date;
  hours: DayHours;
}

function nextOpenDays(businessHours: Record<string, unknown>, bookingWindowDays: number, maxResults: number, today: Date): OpenDay[] {
  const results: OpenDay[] = [];
  for (let offset = 0; offset < bookingWindowDays && results.length < maxResults; offset++) {
    const date = new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
    const dayKey = DAY_KEYS[date.getUTCDay()]!;
    const value = businessHours[dayKey];
    const hours = typeof value === "string" ? parseHoursRange(value) : null;
    if (hours) results.push({ dayOffset: offset, date, hours });
  }
  return results;
}

interface Slot {
  /**
   * Minutes-since-midnight / granularity — a stable identifier derived from
   * the actual clock time, NOT the slot's position in this (filtered,
   * shrinkable) list. Found live via a test: encoding by array position
   * meant that once an earlier slot got booked and disappeared from the
   * list, every later slot silently shifted down and inherited a reply id
   * that used to mean a different time — a stale tap could then either
   * double-book the wrong time or wrongly appear to succeed. Encoding the
   * real time instead means the same reply id always means the same
   * instant, however the surrounding list has changed since it was sent.
   */
  slotIndex: number;
  startsAt: Date;
  endsAt: Date;
}

function computeSlots(
  day: OpenDay,
  durationMinutes: number,
  granularityMinutes: number,
  activeBookings: readonly { startsAt: string; endsAt: string }[],
  now: Date = new Date(),
): Slot[] {
  const base = dayStartUtc(day.date);
  const slots: Slot[] = [];
  for (let start = day.hours.startMinutes; start + durationMinutes <= day.hours.endMinutes; start += granularityMinutes) {
    const startsAt = new Date(base.getTime() + start * 60_000);
    if (startsAt.getTime() <= now.getTime()) continue; // never offer a slot that's already passed today
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const conflict = activeBookings.some((b) => new Date(b.startsAt) < endsAt && new Date(b.endsAt) > startsAt);
    if (!conflict) slots.push({ slotIndex: start / granularityMinutes, startsAt, endsAt });
  }
  return slots;
}

function renderServiceList(waId: string, services: readonly Service[]): HandlerOutput {
  const rows = services.slice(0, MAX_LIST_ITEMS).map((service, index) => ({
    id: encodeService(index),
    title: service.name,
    description: `${service.durationMinutes} min`,
  }));
  rows.push({ id: "nav_main_menu", title: "↩️ Main Menu", description: "" });
  return {
    nextState: "BOOKING_SELECT_SERVICE",
    outboundPayload: buildListMessage(waId, "Book an Appointment 📅", "What would you like to book?", "Tap to choose a service", "Choose a Service", rows),
  };
}

function renderProviderList(waId: string, serviceIndex: number, providers: readonly Provider[]): HandlerOutput {
  const rows = providers.slice(0, MAX_LIST_ITEMS).map((provider, index) => ({
    id: encodeProvider(serviceIndex, index),
    title: provider.name,
  }));
  rows.push({ id: "nav_main_menu", title: "↩️ Main Menu" });
  return {
    nextState: "BOOKING_SELECT_PROVIDER",
    outboundPayload: buildListMessage(waId, "Choose Who You'd Like", "Any preference on who helps you?", "Tap to choose", "Choose", rows),
  };
}

function renderDateList(waId: string, serviceIndex: number, providerIndex: number, handlerArgs: Record<string, unknown>, prefix?: string): HandlerOutput {
  const bookingWindowDays = Number(handlerArgs.bookingWindowDays) || 14;
  const businessHours = (handlerArgs.businessHours as Record<string, unknown>) ?? {};
  const openDays = nextOpenDays(businessHours, bookingWindowDays, MAX_LIST_ITEMS, new Date());

  if (openDays.length === 0) {
    return {
      nextState: "ROOT",
      outboundPayload: buildButtonMessage(waId, "Booking", "Sorry, we don't have any open hours configured right now — please try again later or talk to us directly.", [
        MAIN_MENU_BUTTON,
      ]),
    };
  }

  const rows = openDays.map((day) => ({ id: encodeDate(serviceIndex, providerIndex, day.dayOffset), title: formatDateLabel(day.date) }));
  rows.push({ id: "nav_main_menu", title: "↩️ Main Menu" });
  const body = prefix ? `${prefix} What date works for you?` : "What date works for you?";
  return {
    nextState: "BOOKING_SELECT_DATE",
    outboundPayload: buildListMessage(waId, "Pick a Date 🗓️", body, "Tap to choose a date", "Choose a Date", rows),
  };
}

async function renderTimeList(
  repository: BookingRepository,
  context: HandlerInput["context"],
  waId: string,
  serviceIndex: number,
  providerIndex: number,
  dayOffset: number,
  handlerArgs: Record<string, unknown>,
  prefix?: string,
): Promise<HandlerOutput> {
  const services = (handlerArgs.services as Service[] | undefined) ?? [];
  const providers = (handlerArgs.providers as Provider[] | undefined) ?? [];
  const service = services[serviceIndex];
  const bookingWindowDays = Number(handlerArgs.bookingWindowDays) || 14;
  const granularity = Number(handlerArgs.slotGranularityMinutes) || 30;
  const businessHours = (handlerArgs.businessHours as Record<string, unknown>) ?? {};

  if (!service) return renderServiceList(waId, services);

  const openDays = nextOpenDays(businessHours, bookingWindowDays, bookingWindowDays, new Date());
  const day = openDays.find((d) => d.dayOffset === dayOffset);
  if (!day) return renderDateList(waId, serviceIndex, providerIndex, handlerArgs);

  const providerLabel = providerIndex === NO_PROVIDER ? "_default" : (providers[providerIndex]?.name ?? "_default");
  const dayStart = dayStartUtc(day.date).toISOString();
  const dayEnd = new Date(dayStartUtc(day.date).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const active = await repository.listActiveBookings(context.contextType, context.contextId, dayStart, dayEnd);
  const activeForProvider = active.filter((b) => b.provider === providerLabel);

  const slots = computeSlots(day, service.durationMinutes, granularity, activeForProvider);
  if (slots.length === 0) {
    return renderDateList(waId, serviceIndex, providerIndex, handlerArgs, "That day's fully booked —");
  }

  const rows = slots.slice(0, MAX_LIST_ITEMS).map((slot) => ({
    id: encodeTime(serviceIndex, providerIndex, dayOffset, slot.slotIndex),
    title: formatTime(slot.startsAt.getUTCHours() * 60 + slot.startsAt.getUTCMinutes()),
  }));
  rows.push({ id: "nav_main_menu", title: "↩️ Main Menu" });
  const body = prefix ? `${prefix} What time works for you?` : `Available times for ${formatDateLabel(day.date)}:`;
  return {
    nextState: "BOOKING_SELECT_TIME",
    outboundPayload: buildListMessage(waId, "Pick a Time ⏰", body, "Tap to choose a time", "Choose a Time", rows),
  };
}

async function holdSlot(
  repository: BookingRepository,
  context: HandlerInput["context"],
  waId: string,
  serviceIndex: number,
  providerIndex: number,
  dayOffset: number,
  slotIndex: number,
  handlerArgs: Record<string, unknown>,
): Promise<HandlerOutput> {
  const services = (handlerArgs.services as Service[] | undefined) ?? [];
  const providers = (handlerArgs.providers as Provider[] | undefined) ?? [];
  const service = services[serviceIndex];
  const bookingWindowDays = Number(handlerArgs.bookingWindowDays) || 14;
  const granularity = Number(handlerArgs.slotGranularityMinutes) || 30;
  const businessHours = (handlerArgs.businessHours as Record<string, unknown>) ?? {};
  if (!service) return renderServiceList(waId, services);

  const openDays = nextOpenDays(businessHours, bookingWindowDays, bookingWindowDays, new Date());
  const day = openDays.find((d) => d.dayOffset === dayOffset);
  if (!day) return renderDateList(waId, serviceIndex, providerIndex, handlerArgs);

  const providerLabel = providerIndex === NO_PROVIDER ? "_default" : (providers[providerIndex]?.name ?? "_default");
  const dayStart = dayStartUtc(day.date).toISOString();
  const dayEnd = new Date(dayStartUtc(day.date).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const active = await repository.listActiveBookings(context.contextType, context.contextId, dayStart, dayEnd);
  const slots = computeSlots(day, service.durationMinutes, granularity, active.filter((b) => b.provider === providerLabel));
  const slot = slots.find((s) => s.slotIndex === slotIndex);
  if (!slot) {
    return renderTimeList(repository, context, waId, serviceIndex, providerIndex, dayOffset, handlerArgs, "Sorry, that time's no longer available —");
  }

  const held = await repository.createHold({
    contextType: context.contextType,
    contextId: context.contextId,
    waId,
    service: service.name,
    provider: providerLabel,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    heldUntil: new Date(Date.now() + HOLD_DURATION_MS).toISOString(),
  });
  if (!held) {
    return renderTimeList(repository, context, waId, serviceIndex, providerIndex, dayOffset, handlerArgs, "Sorry, someone just grabbed that time —");
  }

  const priceLine = service.price !== undefined ? `\nPrice: ${service.price}` : "";
  const providerLine = providerIndex !== NO_PROVIDER ? `\nWith: ${providers[providerIndex]?.name}` : "";
  const summary =
    `${service.name}${providerLine}\n${formatDateLabel(day.date)} at ${formatTime(slot.startsAt.getUTCHours() * 60 + slot.startsAt.getUTCMinutes())}` +
    `${priceLine}\n\nConfirm this booking? We'll hold it for you for a few minutes.`;
  return {
    nextState: "BOOKING_CONFIRM",
    outboundPayload: buildButtonMessage(waId, "Confirm Your Booking", summary, [
      { id: `booking_confirm_yes_${held.id}`, title: "Yes, book it ✅" },
      { id: `booking_confirm_no_${held.id}`, title: "No, cancel" },
    ]),
  };
}

export function createBookingHandler(repository: BookingRepository): (input: HandlerInput) => Promise<HandlerOutput> {
  return async function bookingHandler(input: HandlerInput): Promise<HandlerOutput> {
    const replyId = input.message.interactiveReplyId;
    const handlerArgs = input.stateEntry.handlerArgs;
    const services = (handlerArgs.services as Service[] | undefined) ?? [];
    const providers = (handlerArgs.providers as Provider[] | undefined) ?? [];

    if (replyId === "nav_main_menu") {
      return { nextState: "ROOT" };
    }

    if (replyId?.startsWith("booking_confirm_yes_")) {
      const bookingId = replyId.slice("booking_confirm_yes_".length);
      const confirmed = await repository.confirmBooking(bookingId);
      if (!confirmed) {
        return {
          nextState: "ROOT",
          outboundPayload: buildButtonMessage(input.waId, "Booking Expired", "Sorry, that hold expired before you confirmed — please pick a time again.", [
            MAIN_MENU_BUTTON,
          ]),
        };
      }
      return {
        nextState: "ROOT",
        outboundPayload: buildButtonMessage(
          input.waId,
          "You're Booked! 🎉",
          `${confirmed.service} on ${confirmed.startsAt.slice(0, 10)} at ${formatTime(new Date(confirmed.startsAt).getUTCHours() * 60 + new Date(confirmed.startsAt).getUTCMinutes())}. See you then!`,
          [MAIN_MENU_BUTTON],
        ),
      };
    }

    if (replyId?.startsWith("booking_confirm_no_")) {
      const bookingId = replyId.slice("booking_confirm_no_".length);
      await repository.cancelBooking(bookingId);
      return {
        nextState: "ROOT",
        outboundPayload: buildButtonMessage(input.waId, "No Problem", "Let us know if you'd like to book something else.", [MAIN_MENU_BUTTON]),
      };
    }

    const timeParts = replyId ? parseInts(replyId, "booking_time_") : null;
    if (timeParts && timeParts.length === 4) {
      const [serviceIndex, providerIndex, dayOffset, slotIndex] = timeParts as [number, number, number, number];
      return holdSlot(repository, input.context, input.waId, serviceIndex, providerIndex, dayOffset, slotIndex, handlerArgs);
    }

    const dateParts = replyId ? parseInts(replyId, "booking_date_") : null;
    if (dateParts && dateParts.length === 3) {
      const [serviceIndex, providerIndex, dayOffset] = dateParts as [number, number, number];
      return renderTimeList(repository, input.context, input.waId, serviceIndex, providerIndex, dayOffset, handlerArgs);
    }

    const providerParts = replyId ? parseInts(replyId, "booking_prov_") : null;
    if (providerParts && providerParts.length === 2) {
      const [serviceIndex, providerIndex] = providerParts as [number, number];
      return renderDateList(input.waId, serviceIndex, providerIndex, handlerArgs);
    }

    const serviceParts = replyId ? parseInts(replyId, "booking_svc_") : null;
    if (serviceParts && serviceParts.length === 1) {
      const [serviceIndex] = serviceParts as [number];
      if (providers.length > 0) return renderProviderList(input.waId, serviceIndex, providers);
      return renderDateList(input.waId, serviceIndex, NO_PROVIDER, handlerArgs);
    }

    // default: initial entry into booking, or any unrecognized reply
    return renderServiceList(input.waId, services);
  };
}
