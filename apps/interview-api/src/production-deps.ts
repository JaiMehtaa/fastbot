import { createDbClient } from "@whatsapp-bot-platform/db";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { createPromptTemplateResolver } from "@whatsapp-bot-platform/prompt-config";
import { createDbSessionStore } from "./db-session-store.js";
import { CLASSIFIER_PROMPT_KEY, createLlmClassifyCapabilities, DEFAULT_CLASSIFIER_INSTRUCTIONS } from "./llm-capability-classifier.js";
import { createLlmExtractFields, DEFAULT_EXTRACTOR_INSTRUCTIONS, EXTRACTOR_PROMPT_KEY } from "./llm-extractor.js";
import { createLlmExtractOwnerInfo, DEFAULT_OWNER_INFO_INSTRUCTIONS, OWNER_INFO_PROMPT_KEY } from "./llm-owner-info-extractor.js";
import { createLlmPhraseQuestion, DEFAULT_PHRASER_INSTRUCTIONS, PHRASER_PROMPT_KEY } from "./llm-question-phraser.js";
import type { ServerDeps } from "./server.js";
import { createFetchScraper } from "./website-scraper.js";

/**
 * Assembles createServer()'s real deps — the production counterpart to
 * createServer()'s zero-config heuristic/in-memory defaults. Requires
 * OPENAI_API_KEY and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (both clients
 * fail loudly at construction time if their credentials are missing), so
 * this is deliberately NOT the default `createServer()` falls back to —
 * that default has to keep working with zero credentials for tests and
 * local dev (see dev-start.ts). scrapeFn doesn't depend on OpenAI at all
 * (it's a plain fetch), but is still assembled here alongside everything
 * else real production traffic uses.
 *
 * Every LLM call site's editable instructions are resolved through
 * createPromptTemplateResolver against the same DB apps/admin writes to
 * (packages/prompt-config) — an admin edit takes effect within the
 * resolver's cache TTL, no redeploy needed.
 */
export function createProductionDeps(config: { openAiApiKey?: string } = {}): ServerDeps {
  const client = createOpenAiClient({ apiKey: config.openAiApiKey });
  const db = createDbClient();
  return {
    sessionStore: createDbSessionStore(db),
    classifyFn: createLlmClassifyCapabilities(client, createPromptTemplateResolver(db, CLASSIFIER_PROMPT_KEY, DEFAULT_CLASSIFIER_INSTRUCTIONS)),
    extractFn: createLlmExtractFields(client, createPromptTemplateResolver(db, EXTRACTOR_PROMPT_KEY, DEFAULT_EXTRACTOR_INSTRUCTIONS)),
    extractOwnerInfoFn: createLlmExtractOwnerInfo(client, createPromptTemplateResolver(db, OWNER_INFO_PROMPT_KEY, DEFAULT_OWNER_INFO_INSTRUCTIONS)),
    scrapeFn: createFetchScraper(),
    phraseFn: createLlmPhraseQuestion(client, createPromptTemplateResolver(db, PHRASER_PROMPT_KEY, DEFAULT_PHRASER_INSTRUCTIONS)),
  };
}
