import Fastify, { type FastifyInstance } from "fastify";
import type { ProcessInboundMessageDeps } from "./process-inbound-message.js";
import { processInboundMessage } from "./process-inbound-message.js";
import { parseWebhookPayload, type MetaWebhookBody } from "./webhook-payload.js";

/**
 * Fastify app factory — deps are injected (same discipline as everywhere
 * else in this codebase) so this is testable via Fastify's `.inject()`
 * without binding a real port or needing live BSP/DB credentials. Wiring
 * real production deps (a Supabase-backed RuntimeRepository, a 360dialog-
 * backed BspAdapter) is a separate follow-up once those exist — see
 * packages/db and apps/runtime's README for what's still a mock.
 */
export function createServer(deps: ProcessInboundMessageDeps): FastifyInstance {
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

  return app;
}
