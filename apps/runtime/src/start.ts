import { createServer } from "./server.js";
import { createProductionDeps } from "./production-deps.js";
import { runReminderSweep } from "./reminder-sweep.js";

const sandboxPhoneNumberId = process.env.SANDBOX_PHONE_NUMBER_ID;
if (!sandboxPhoneNumberId) {
  throw new Error("SANDBOX_PHONE_NUMBER_ID is not set — required to distinguish sandbox traffic from live tenants.");
}

const sandboxWhatsAppNumber = process.env.SANDBOX_WHATSAPP_NUMBER;
if (!sandboxWhatsAppNumber) {
  throw new Error("SANDBOX_WHATSAPP_NUMBER is not set — the real, dialable number used to render wa.me join links.");
}

const deps = createProductionDeps({ sandboxPhoneNumberId, sandboxWhatsAppNumber });
const app = createServer(deps);
const port = Number(process.env.PORT ?? 3002);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`runtime listening on :${port}`);
  })
  .catch((error: unknown) => {
    console.error("runtime failed to start:", error);
    process.exit(1);
  });

// Booking reminders: a plain polling sweep, not a durable job queue (see
// reminder-sweep.ts's own docstring — self-contained per the dynamic-
// interview plan's locked decision). Checks every REMINDER_SWEEP_INTERVAL_MS
// for confirmed bookings starting within REMINDER_WINDOW_MS that haven't
// been reminded yet.
const REMINDER_SWEEP_INTERVAL_MS = Number(process.env.REMINDER_SWEEP_INTERVAL_MS ?? 5 * 60_000);
const REMINDER_WINDOW_MS = Number(process.env.REMINDER_WINDOW_MS ?? 30 * 60_000);
setInterval(() => {
  runReminderSweep(deps.repository, deps.bspAdapter, REMINDER_WINDOW_MS).catch((error: unknown) => {
    console.error("reminder sweep failed:", error);
  });
}, REMINDER_SWEEP_INTERVAL_MS);
