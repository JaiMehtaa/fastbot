import { createDbClient } from "@whatsapp-bot-platform/db";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { createDbSessionStore } from "./db-session-store.js";
import { createLlmClassifyLob } from "./llm-classifier.js";
import { createLlmExtractFields } from "./llm-extractor.js";
import type { ServerDeps } from "./server.js";

/**
 * Assembles createServer()'s real deps — the production counterpart to
 * createServer()'s zero-config heuristic/in-memory defaults. Requires
 * OPENAI_API_KEY and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (both clients
 * fail loudly at construction time if their credentials are missing), so
 * this is deliberately NOT the default `createServer()` falls back to —
 * that default has to keep working with zero credentials for tests and
 * local dev (see dev-start.ts).
 */
export function createProductionDeps(config: { openAiApiKey?: string } = {}): ServerDeps {
  const client = createOpenAiClient({ apiKey: config.openAiApiKey });
  return {
    sessionStore: createDbSessionStore(createDbClient()),
    classifyFn: createLlmClassifyLob(client),
    extractFn: createLlmExtractFields(client),
  };
}
