import { createDbClient } from "@whatsapp-bot-platform/db";
import { createMockBspAdapter } from "./bsp-adapter.js";
import { createDbRepository } from "./db-repository.js";
import { createInterpreter } from "./interpreter.js";
import { runReminderSweep } from "./reminder-sweep.js";
import { createServer } from "./server.js";

/**
 * Local-dev entrypoint using a mock BspAdapter and an always-escalate FAQ
 * fallback — no THREE_SIXTY_DIALOG_API_KEY/OPENAI_API_KEY required — but a
 * REAL, DB-backed repository. Same reasoning as apps/interview-api's
 * dev-start.ts: apps/dashboard's connect-your-number flow creates real
 * `tenants` rows in Postgres directly (not through this server), so an
 * in-memory repository here would never see them — every tenant would look
 * "unknown" to /webhook and /preview/message even though it's real and
 * live. Requires SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (e.g. a local
 * `supabase start` stack); still no OPENAI/360dialog key needed.
 * start.ts (real 360dialog + OpenAI-backed deps) is the production
 * entrypoint.
 */
const repository = createDbRepository(createDbClient());
const bspAdapter = createMockBspAdapter();
const app = createServer({
  repository,
  bspAdapter,
  interpret: createInterpreter(async () => null, repository),
  sandboxPhoneNumberId: process.env.SANDBOX_PHONE_NUMBER_ID ?? "dev-sandbox-phone-number-id",
  sandboxWhatsAppNumber: process.env.SANDBOX_WHATSAPP_NUMBER ?? "911234567890",
});

const port = Number(process.env.PORT ?? 3002);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`runtime (dev, mock BSP) listening on :${port}`);
  })
  .catch((error: unknown) => {
    console.error("runtime failed to start:", error);
    process.exit(1);
  });

// Same self-contained reminder sweep as start.ts, just against the mock BSP adapter — see
// reminder-sweep.ts's docstring.
const REMINDER_SWEEP_INTERVAL_MS = Number(process.env.REMINDER_SWEEP_INTERVAL_MS ?? 5 * 60_000);
const REMINDER_WINDOW_MS = Number(process.env.REMINDER_WINDOW_MS ?? 30 * 60_000);
setInterval(() => {
  runReminderSweep(repository, bspAdapter, REMINDER_WINDOW_MS).catch((error: unknown) => {
    console.error("reminder sweep failed:", error);
  });
}, REMINDER_SWEEP_INTERVAL_MS);
