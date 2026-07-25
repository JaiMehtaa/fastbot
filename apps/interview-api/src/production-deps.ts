import { createOpenRouterClient } from "@whatsapp-bot-platform/eval";
import { createLlmClassifyLob } from "./llm-classifier.js";
import { createLlmExtractFields } from "./llm-extractor.js";
import { createInMemorySessionStore } from "./session-store.js";
import type { ServerDeps } from "./server.js";

/**
 * Assembles createServer()'s real, OpenRouter-backed deps — the production
 * counterpart to createServer()'s zero-config heuristic defaults. Requires
 * OPENROUTER_API_KEY (createOpenRouterClient fails loudly at construction
 * time if it's missing, per docs/architecture.md), so this is deliberately
 * NOT the default `createServer()` falls back to — that default has to keep
 * working with zero credentials for tests and local dev.
 *
 * The session store is still in-memory even here — no live Supabase project
 * exists yet (see packages/db), so a process restart loses in-progress
 * interviews. That's a real, known gap, not solved by this function; a
 * packages/db-backed SessionStore is a direct, mechanical follow-up once a
 * Supabase project exists.
 */
export function createProductionDeps(config: { openRouterApiKey?: string } = {}): ServerDeps {
  const client = createOpenRouterClient({ apiKey: config.openRouterApiKey });
  return {
    sessionStore: createInMemorySessionStore(),
    classifyFn: createLlmClassifyLob(client),
    extractFn: createLlmExtractFields(client),
  };
}
