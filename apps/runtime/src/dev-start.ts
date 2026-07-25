import { createMockBspAdapter } from "./bsp-adapter.js";
import { createInterpreter } from "./interpreter.js";
import { createInMemoryRepository } from "./repository.js";
import { createServer } from "./server.js";

/**
 * Local-dev entrypoint using a mock BspAdapter and an always-escalate FAQ
 * fallback — no THREE_SIXTY_DIALOG_API_KEY/OPENROUTER_API_KEY required.
 * start.ts (real 360dialog + OpenRouter-backed deps) is the production
 * entrypoint; this one exists so apps/web's interview + sandbox-issue flow
 * can be exercised from an actual browser without live credentials. It
 * cannot prove a real WhatsApp round-trip — only that /sandbox/issue
 * returns a real token and joinUrl for a real completed draft.
 */
const app = createServer({
  repository: createInMemoryRepository(),
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
