import { createServer } from "./server.js";

/**
 * Local-dev entrypoint using createServer()'s zero-config heuristic defaults
 * — no OPENAI_API_KEY required. start.ts (real OpenAI-backed deps)
 * is the production entrypoint; this one exists so the full pipeline can be
 * exercised from an actual browser without live credentials.
 */
const app = createServer();
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
