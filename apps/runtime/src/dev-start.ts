import { createDbClient } from "@whatsapp-bot-platform/db";
import { createMockBspAdapter } from "./bsp-adapter.js";
import { createDbRepository } from "./db-repository.js";
import { createInterpreter } from "./interpreter.js";
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
const app = createServer({
  repository: createDbRepository(createDbClient()),
  bspAdapter: createMockBspAdapter(),
  interpret: createInterpreter(async () => null),
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
