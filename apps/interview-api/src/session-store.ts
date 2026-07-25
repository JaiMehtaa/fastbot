import type { InterviewSessionState } from "./interview-session.js";

/**
 * Abstraction over where session state lives between HTTP turns — same
 * dependency-injection discipline as everywhere else in this codebase. No
 * Supabase project exists yet, so createServer() defaults to the in-memory
 * implementation; a real one would persist to draft_configs (packages/db)
 * instead, without processTurn() or the route handler changing at all.
 */
export interface SessionStore {
  get(draftSessionId: string): InterviewSessionState | undefined;
  set(draftSessionId: string, state: InterviewSessionState): void;
}

export function createInMemorySessionStore(): SessionStore {
  const sessions = new Map<string, InterviewSessionState>();
  return {
    get: (draftSessionId) => sessions.get(draftSessionId),
    set: (draftSessionId, state) => {
      sessions.set(draftSessionId, state);
    },
  };
}
