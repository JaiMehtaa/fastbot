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
  message?: Partial<InboundMessage>;
}

const VALID_MESSAGE_TYPES = ["text", "interactive", "image", "video", "document", "audio", "sticker"];

/**
 * A missing waId/messageId/type used to reach insertChatHistory() and come
 * back as a raw Postgres NOT NULL violation (e.g. `insertChatHistory: null
 * value in column "message_id" violates not-null constraint`) — a client
 * error leaking internal column/table names as a 500, discovered live by
 * an automated test round. /webhook doesn't need this: parseWebhookPayload()
 * already constructs a well-formed InboundMessage from Meta's real payload,
 * or classifies the event as "ignored" — but /preview/message takes a
 * caller-supplied message object directly, with nothing upstream guaranteeing its shape.
 */
function validateInboundMessage(message: Partial<InboundMessage> | undefined): string | null {
  if (!message) return "message is required";
  if (typeof message.waId !== "string" || !message.waId) return "message.waId is required";
  if (typeof message.messageId !== "string" || !message.messageId) return "message.messageId is required";
  if (typeof message.type !== "string" || !VALID_MESSAGE_TYPES.includes(message.type)) {
    return `message.type must be one of: ${VALID_MESSAGE_TYPES.join(", ")}`;
  }
  if (typeof message.receivedAt !== "string" || !message.receivedAt) return "message.receivedAt is required";
  return null;
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
    if (!body?.phoneNumberId) {
      return reply.code(400).send({ error: "phoneNumberId is required" });
    }
    const messageError = validateInboundMessage(body.message);
    if (messageError) {
      return reply.code(400).send({ error: messageError });
    }

    // A fresh adapter per request, not a shared server-lifetime singleton —
    // createMockBspAdapter()'s messageId is a random UUID (see bsp-adapter.ts),
    // not a counter that needs to keep incrementing, so nothing requires
    // sharing one instance across requests. A shared instance's sentMessages
    // array, sliced by [before, after) around each await, isn't actually
    // request-isolated: two genuinely concurrent /preview/message calls could
    // each read a slice containing the OTHER request's outbound message —
    // found live via QA testing (two customers tapping the same booking slot
    // at the same instant each saw both replies). A per-request adapter makes
    // that structurally impossible.
    const previewBspAdapter = createMockBspAdapter();
    const result = await processInboundMessage(body.phoneNumberId, body.message as InboundMessage, { ...deps, bspAdapter: previewBspAdapter });
    return reply.code(200).send({ status: result.status, sentMessages: previewBspAdapter.sentMessages });
  });

  return app;
}
