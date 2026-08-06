"use server";

import { revalidatePath } from "next/cache";
import { validateDraft } from "@whatsapp-bot-platform/compiler";
import { createDbClient } from "@whatsapp-bot-platform/db";
import { DbRepositoryError, RepublishError, createDbRepository, republishTenantConfig } from "@whatsapp-bot-platform/runtime";
import type { DraftConfig, PrimitiveFieldValues, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { getAccountTenants } from "../../../../lib/get-account-tenants";
import { getTenantEditorData } from "../../../../lib/get-tenant-editor-data";

export interface SaveTenantConfigResult {
  error?: string;
  /** Echoed back on success so the client can sync its "last saved" baseline without a full page reload — revalidatePath() alone doesn't refresh an already-mounted client component's props. */
  updatedFieldValues?: Partial<Record<PrimitiveKey, PrimitiveFieldValues>>;
}

/**
 * Saves an edit made in the dashboard editor and publishes it live. Per the
 * schema's own design (draft_sessions.tenant_id's migration comment: "set
 * once this draft is a post-launch edit against an existing tenant"), each
 * save creates a fresh draft_sessions row scoped to this tenant rather than
 * appending to the original interview's session — that session already
 * reached its own terminal 'promoted' state and getDraftConfig() always
 * reads draft_configs version 1, so a new session keeps that assumption
 * true for every edit, not just the first one.
 */
export async function saveTenantConfigAction(
  tenantId: string,
  fieldValues: Partial<Record<PrimitiveKey, PrimitiveFieldValues>>,
): Promise<SaveTenantConfigResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const accountTenants = await getAccountTenants(user.id);
  if (!accountTenants.some((tenant) => tenant.tenantId === tenantId)) {
    return { error: "You don't have access to this bot." };
  }

  const current = await getTenantEditorData(tenantId);
  if (!current) return { error: "Couldn't load this bot's current configuration." };

  // Validate BEFORE writing anything — a rejected save used to still insert a
  // draft_sessions + draft_configs row (found live via QA testing: every failed
  // save left a permanent orphan pair, misleadingly marked status='promoted'
  // even though nothing was ever actually published).
  const candidate: DraftConfig = {
    draftSessionId: tenantId, // not yet a real session id — only used in the error message below
    version: 1,
    lobKey: current.draftConfig.lobKey,
    selectedPrimitives: current.draftConfig.selectedPrimitives,
    fieldValues,
  };
  const validation = validateDraft(candidate);
  if (!validation.valid) {
    const errorCount = validation.issues.filter((issue) => issue.severity === "error").length;
    return {
      error: `Cannot publish: ${validation.missingRequiredFields.length} missing required field(s), ${errorCount} error(s).`,
    };
  }

  const db = createDbClient();
  const { data: session, error: sessionError } = await db
    .from("draft_sessions")
    .insert({ status: "promoted", tenant_id: tenantId })
    .select("id")
    .single();
  if (sessionError || !session) return { error: `Couldn't save: ${sessionError?.message}` };

  const { error: configError } = await db.from("draft_configs").insert({
    draft_session_id: session.id,
    version: 1,
    lob_key: current.draftConfig.lobKey,
    selected_primitives: [...current.draftConfig.selectedPrimitives],
    field_values: fieldValues as never,
  });
  if (configError) return { error: `Couldn't save: ${configError.message}` };

  const draft: DraftConfig = { ...candidate, draftSessionId: session.id };

  try {
    await republishTenantConfig(draft, tenantId, createDbRepository(db));
  } catch (error) {
    if (error instanceof RepublishError) return { error: error.message };
    if (error instanceof DbRepositoryError) return { error: `Couldn't publish this change: ${error.message}` };
    throw error;
  }

  revalidatePath(`/dashboard/${tenantId}/edit`);
  revalidatePath(`/dashboard`);
  return { updatedFieldValues: fieldValues };
}
