import Fastify, { type FastifyInstance } from "fastify";

/**
 * Bare skeleton — deliberately no interview-turn logic yet. The actual
 * conversational interview agent (LLM function-calling extraction wired to
 * packages/compiler's incremental validation and packages/eval's confidence
 * gating, per docs/architecture.md "Interview Agent Design") is scoped as a
 * separate, collaborative piece of work, not built here.
 */
export function createServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
