import { createDbClient } from "@whatsapp-bot-platform/db";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { createDbRepository } from "./db-repository.js";
import { createInterpreter } from "./interpreter.js";
import { createLlmFaqFallback } from "./llm-faq-fallback.js";
import type { ServerDeps } from "./server.js";
import { createThreeSixtyDialogAdapter } from "./three-sixty-dialog-adapter.js";

/**
 * Assembles processInboundMessage()'s real deps: a real Supabase/Postgres-
 * backed RuntimeRepository, a real 360dialog BspAdapter, and a real
 * OpenAI-backed faq_support fallback judge — all three fail loudly at
 * construction time if their required env vars/keys are missing
 * (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, THREE_SIXTY_DIALOG_API_KEY,
 * OPENAI_API_KEY). This function has no zero-credential default, unlike
 * apps/interview-api's createServer(), because there's no meaningful
 * heuristic stand-in for sending a real WhatsApp message or persisting a
 * live tenant (see dev-start.ts for the in-memory/mock local-dev path).
 */
export function createProductionDeps(config: {
  sandboxPhoneNumberId: string;
  sandboxWhatsAppNumber: string;
  openAiApiKey?: string;
  threeSixtyDialogApiKey?: string;
}): ServerDeps {
  const client = createOpenAiClient({ apiKey: config.openAiApiKey });
  const repository = createDbRepository(createDbClient());
  const bspAdapter = createThreeSixtyDialogAdapter({ apiKey: config.threeSixtyDialogApiKey });
  const interpret = createInterpreter(createLlmFaqFallback(client));

  return {
    repository,
    bspAdapter,
    interpret,
    sandboxPhoneNumberId: config.sandboxPhoneNumberId,
    sandboxWhatsAppNumber: config.sandboxWhatsAppNumber,
  };
}
