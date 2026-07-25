import type { InterviewSessionState } from "./interview-session.js";

/**
 * Abstraction over where session state lives between HTTP turns — same
 * dependency-injection discipline as everywhere else in this codebase.
 * Async even though the in-memory implementation never actually awaits
 * anything — a real, persistent implementation (db-session-store.ts,
 * backed by draft_sessions/draft_configs) needs a network round-trip, and
 * the interface has to accommodate that from the start rather than forcing
 * a breaking change onto server.ts's one call site later.
 */
export interface SessionStore {
  get(draftSessionId: string): Promise<InterviewSessionState | undefined>;
  set(draftSessionId: string, state: InterviewSessionState): Promise<void>;
}

export function createInMemorySessionStore(): SessionStore {
  const sessions = new Map<string, InterviewSessionState>();
  return {
    async get(draftSessionId) {
      return sessions.get(draftSessionId);
    },
    async set(draftSessionId, state) {
      sessions.set(draftSessionId, state);
    },
  };
}
