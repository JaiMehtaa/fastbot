import { createDbClient } from "@whatsapp-bot-platform/db";
import { createDbSessionStore } from "./db-session-store.js";
import { createServer } from "./server.js";

/**
 * Local-dev entrypoint using heuristic (no-LLM) classify/extract — no
 * OPENAI_API_KEY required — but a REAL, DB-backed session store. A draft
 * completed here is a real draft_configs row, which apps/dashboard's
 * connect-your-number flow (Phase C) needs to find — an in-memory session
 * store (createServer()'s own zero-config default) would make every draft
 * invisible outside this process, breaking that flow even though the
 * interview itself "worked." Requires SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * (e.g. a local `supabase start` stack); still no OPENAI_API_KEY needed.
 * start.ts (real OpenAI + DB) is the production entrypoint.
 */
const app = createServer({ sessionStore: createDbSessionStore(createDbClient()) });
const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`interview-api (dev, heuristic) listening on :${port}`);
  })
  .catch((error: unknown) => {
    console.error("interview-api failed to start:", error);
    process.exit(1);
  });
