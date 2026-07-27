import { createDbClient } from "@whatsapp-bot-platform/db";
import type { DraftConfig, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";

/**
 * Reads the completed interview's draft straight out of draft_configs
 * (apps/interview-api's db-session-store.ts is what wrote it, version 1 —
 * see that file's comment on why there's no real version history here) to
 * build the DraftConfig promoteDraftToTenant() needs. Server-side only,
 * same service-role pattern as lib/get-account-tenants.ts.
 */
export async function getDraftConfig(draftSessionId: string): Promise<DraftConfig | null> {
  const db = createDbClient();
  const { data, error } = await db
    .from("draft_configs")
    .select("lob_key, selected_primitives, field_values")
    .eq("draft_session_id", draftSessionId)
    .eq("version", 1)
    .maybeSingle();

  if (error) throw new Error(`getDraftConfig: ${error.message}`);
  if (!data) return null;

  return {
    draftSessionId,
    version: 1,
    lobKey: data.lob_key,
    selectedPrimitives: data.selected_primitives as PrimitiveKey[],
    fieldValues: data.field_values as DraftConfig["fieldValues"],
  };
}
