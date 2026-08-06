import type { BspAdapter } from "./bsp-adapter.js";
import type { RuntimeRepository } from "./repository.js";
import { MAIN_MENU_BUTTON, buildButtonMessage } from "./whatsapp-payload.js";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const hour24 = date.getUTCHours();
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const time = `${hour12}:${date.getUTCMinutes().toString().padStart(2, "0")} ${period}`;
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()} at ${time}`;
}

export interface ReminderSweepResult {
  remindersSent: number;
  failures: number;
}

/**
 * Self-contained, no new job-queue infra (per the dynamic-interview plan's
 * locked decision) — a plain polling sweep the caller runs on an interval
 * (see start.ts/dev-start.ts), not a durable task queue. Idempotent by
 * construction: listBookingsNeedingReminder only ever returns bookings
 * with reminder_sent_at still null, and this marks each one sent
 * immediately after a successful send — a booking is never reminded
 * twice, and a send failure for one booking never blocks the rest.
 */
export async function runReminderSweep(
  repository: RuntimeRepository,
  bspAdapter: BspAdapter,
  windowMs: number,
  now: Date = new Date(),
): Promise<ReminderSweepResult> {
  const due = await repository.listBookingsNeedingReminder(windowMs, now);
  let remindersSent = 0;
  let failures = 0;

  for (const booking of due) {
    try {
      const message = buildButtonMessage(
        booking.waId,
        "Appointment Reminder ⏰",
        `Just a reminder: your ${booking.service} appointment is coming up on ${formatWhen(booking.startsAt)}. See you then!`,
        [MAIN_MENU_BUTTON],
      );
      await bspAdapter.send(message);
      await repository.markReminderSent(booking.id);
      remindersSent += 1;
    } catch {
      // one booking's reminder failing (a transient BSP error, a bad wa_id) must not stop
      // the sweep from reminding everyone else due in this pass — it'll simply be picked
      // up again on the next sweep since reminder_sent_at was never set
      failures += 1;
    }
  }

  return { remindersSent, failures };
}
