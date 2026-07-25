import { createOpenRouterClient } from "@whatsapp-bot-platform/eval";
import { createInterpreter } from "./interpreter.js";
import { createLlmFaqFallback } from "./llm-faq-fallback.js";
import { createInMemoryRepository } from "./repository.js";
import type { ServerDeps } from "./server.js";
import { createThreeSixtyDialogAdapter } from "./three-sixty-dialog-adapter.js";

/**
 * Assembles processInboundMessage()'s real deps: a real 360dialog BspAdapter
 * and a real OpenRouter-backed faq_support fallback judge, both of which
 * fail loudly at construction time if their required env vars/keys are
 * missing (THREE_SIXTY_DIALOG_API_KEY, OPENROUTER_API_KEY) — this function
 * has no zero-credential default, unlike apps/interview-api's createServer(),
 * because there's no meaningful heuristic stand-in for sending a real
 * WhatsApp message.
 *
 * The repository is still in-memory even here — no live Supabase project
 * exists yet (see packages/db), so tenants/conversation state/chat history
 * don't survive a process restart. That's a real, known gap, not solved by
 * this function; a packages/db-backed RuntimeRepository is a direct,
 * mechanical follow-up once a Supabase project exists.
 */
export function createProductionDeps(config: {
  sandboxPhoneNumberId: string;
  sandboxWhatsAppNumber: string;
  openRouterApiKey?: string;
  threeSixtyDialogApiKey?: string;
}): ServerDeps {
  const client = createOpenRouterClient({ apiKey: config.openRouterApiKey });
  const repository = createInMemoryRepository();
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
