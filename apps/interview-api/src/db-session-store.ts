import type { DbClient } from "@whatsapp-bot-platform/db";
import type { DraftConfig, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";
import type { InterviewSessionState } from "./interview-session.js";
import type { SessionStore } from "./session-store.js";

export class DbSessionStoreError extends Error {}

/**
 * Real, Supabase/Postgres-backed SessionStore — fulfills the exact interface
 * createInMemorySessionStore() implements (session-store.ts), split across
 * draft_sessions (turn-flow flags: lobAmbiguityAsked, confirmed) and
 * draft_configs (draft content: lobKey, selectedPrimitives, fieldValues,
 * mirroring DraftConfig's own shape exactly). Always writes draft_configs
 * version 1 — InterviewSessionState represents "the current state," not a
 * version history, so there's nothing here that calls for real versioning
 * (unlike tenant_configs, which genuinely needs multiple versions over a
 * tenant's lifetime).
 */
export function createDbSessionStore(db: DbClient): SessionStore {
  return {
    async get(draftSessionId): Promise<InterviewSessionState | undefined> {
      const { data: session, error: sessionError } = await db
        .from("draft_sessions")
        .select("lob_ambiguity_asked, confirmed")
        .eq("id", draftSessionId)
        .maybeSingle();
      if (sessionError) throw new DbSessionStoreError(`get (draft_sessions): ${sessionError.message}`);
      if (!session) return undefined;

      const { data: config, error: configError } = await db
        .from("draft_configs")
        .select("lob_key, selected_primitives, field_values")
        .eq("draft_session_id", draftSessionId)
        .eq("version", 1)
        .maybeSingle();
      if (configError) throw new DbSessionStoreError(`get (draft_configs): ${configError.message}`);

      return {
        draftSessionId,
        lobKey: config?.lob_key ?? null,
        lobAmbiguityAsked: session.lob_ambiguity_asked,
        selectedPrimitives: (config?.selected_primitives ?? []) as PrimitiveKey[],
        fieldValues: (config?.field_values ?? {}) as DraftConfig["fieldValues"],
        confirmed: session.confirmed,
      };
    },

    async set(draftSessionId, state): Promise<void> {
      const { error: sessionError } = await db
        .from("draft_sessions")
        .upsert(
          { id: draftSessionId, lob_ambiguity_asked: state.lobAmbiguityAsked, confirmed: state.confirmed },
          { onConflict: "id" },
        );
      if (sessionError) throw new DbSessionStoreError(`set (draft_sessions): ${sessionError.message}`);

      const { error: configError } = await db.from("draft_configs").upsert(
        {
          draft_session_id: draftSessionId,
          version: 1,
          lob_key: state.lobKey,
          selected_primitives: state.selectedPrimitives as string[],
          field_values: state.fieldValues as never,
        },
        { onConflict: "draft_session_id,version" },
      );
      if (configError) throw new DbSessionStoreError(`set (draft_configs): ${configError.message}`);
    },
  };
}
