import Fastify, { type FastifyInstance } from "fastify";
import type { DraftConfig, InboundMessage } from "@whatsapp-bot-platform/shared-types";
import { createMockBspAdapter } from "./bsp-adapter.js";
import type { ProcessInboundMessageDeps } from "./process-inbound-message.js";
import { processInboundMessage } from "./process-inbound-message.js";
import { SandboxBindingError, issueSandboxBinding } from "./sandbox-binding.js";
import { parseWebhookPayload, type MetaWebhookBody } from "./webhook-payload.js";

export interface ServerDeps extends ProcessInboundMessageDeps {
  /** The real, dialable WhatsApp number backing sandboxPhoneNumberId — used to render wa.me deep links. */
  sandboxWhatsAppNumber: string;
}

interface IssueSandboxRequestBody {
  draft?: DraftConfig;
}

interface PreviewMessageRequestBody {
  phoneNumberId?: string;
  message?: InboundMessage;
}

/**
 * Fastify app factory — deps are injected (same discipline as everywhere
 * else in this codebase) so this is testable via Fastify's `.inject()`
 * without binding a real port or needing live BSP/DB credentials. Wiring
 * real production deps (a Supabase-backed RuntimeRepository, a 360dialog-
 * backed BspAdapter) is a separate follow-up once those exist — see
 * packages/db and apps/runtime's README for what's still a mock.
 */
export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // Server-lifetime, not per-request: createMockBspAdapter()'s messageId
  // counter must keep incrementing across every preview request the same
  // way it would for a real BspAdapter's whole server lifetime — chat_history
  // has a real uniqueness constraint on message_id, so a fresh per-request
  // adapter (counter always restarting at 1) collided on the second message
  // ever sent to the same tenant. Each request slices off only the messages
  // it added, so responses still stay scoped to that one request.
  const previewBspAdapter = createMockBspAdapter();

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/webhook", async (request, reply) => {
    const event = parseWebhookPayload(request.body as MetaWebhookBody);

    if (event.kind === "ignored") {
      return reply.code(200).send({ status: "ignored" });
    }

    if (event.kind === "status") {
      await deps.repository.updateChatHistoryStatusByMessageId(event.messageId, event.status);
      return reply.code(200).send({ status: "ok" });
    }

    const result = await processInboundMessage(event.phoneNumberId, event.message, deps);
    return reply.code(200).send(result);
  });

  // The issuing side of the sandbox join-token flow (docs/architecture.md,
  // "Sandbox Number Multiplexing Mechanism"), exposed over HTTP so apps/web's
  // browser-side "Test on WhatsApp" CTA can request one for a completed draft.
  app.post("/sandbox/issue", async (request, reply) => {
    const body = request.body as IssueSandboxRequestBody;
    if (!body?.draft) {
      return reply.code(400).send({ error: "draft is required" });
    }

    try {
      const result = await issueSandboxBinding(body.draft, deps.sandboxWhatsAppNumber, deps.repository);
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof SandboxBindingError) {
        return reply.code(422).send({ error: error.message });
      }
      throw error;
    }
  });

  // Lets a browser hold a real conversation with a tenant/sandbox draft
  // without a real WhatsApp number — same processInboundMessage() path as
  // /webhook, but with an isolated mock BspAdapter so it can NEVER send a
  // real message regardless of what deps.bspAdapter actually is, and
  // returns the reply directly so the browser can render it (a real Meta
  // webhook doesn't need that back, a preview UI does).
  app.post("/preview/message", async (request, reply) => {
    const body = request.body as PreviewMessageRequestBody;
    if (!body?.phoneNumberId || !body?.message) {
      return reply.code(400).send({ error: "phoneNumberId and message are required" });
    }

    const before = previewBspAdapter.sentMessages.length;
    const result = await processInboundMessage(body.phoneNumberId, body.message, { ...deps, bspAdapter: previewBspAdapter });
    return reply.code(200).send({ status: result.status, sentMessages: previewBspAdapter.sentMessages.slice(before) });
  });

  return app;
}
