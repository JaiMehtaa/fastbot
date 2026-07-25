import Fastify, { type FastifyInstance } from "fastify";
import { heuristicClassifyLob } from "./heuristic-classifier.js";
import { heuristicExtractFields } from "./heuristic-extractor.js";
import { createInitialState, processTurn, type InterviewDeps } from "./interview-session.js";
import { createInMemorySessionStore, type SessionStore } from "./session-store.js";

export interface ServerDeps extends InterviewDeps {
  sessionStore: SessionStore;
}

interface TurnRequestBody {
  draftSessionId?: string;
  text?: string;
}

/**
 * Deps default to the heuristic (no-LLM) classify/extract functions and an
 * in-memory session store — no OpenRouter key or Supabase project needed,
 * this genuinely runs and holds a (heuristic-quality) conversation out of
 * the box. Override any of them to swap in real, OpenRouter-backed
 * implementations later without touching this file's routing.
 */
export function createServer(deps: Partial<ServerDeps> = {}): FastifyInstance {
  const sessionStore = deps.sessionStore ?? createInMemorySessionStore();
  const classifyFn = deps.classifyFn ?? heuristicClassifyLob;
  const extractFn = deps.extractFn ?? heuristicExtractFields;

  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/interview/turn", async (request, reply) => {
    const body = request.body as TurnRequestBody;
    if (!body?.draftSessionId || typeof body.text !== "string") {
      return reply.code(400).send({ error: "draftSessionId and text are required" });
    }

    const existingState = sessionStore.get(body.draftSessionId) ?? createInitialState(body.draftSessionId);
    const result = await processTurn(existingState, body.text, { classifyFn, extractFn });
    sessionStore.set(body.draftSessionId, result.state);

    return reply.code(200).send({ responseText: result.responseText, done: result.done, state: result.state });
  });

  return app;
}
