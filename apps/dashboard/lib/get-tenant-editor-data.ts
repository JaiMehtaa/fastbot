import { createDbClient } from "@whatsapp-bot-platform/db";
import { createDbRepository } from "@whatsapp-bot-platform/runtime";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { getDraftConfig } from "./get-draft-config";

export interface TenantEditorData {
  tenantId: string;
  name: string;
  draftConfig: DraftConfig;
}

/**
 * Loads what the dashboard editor needs to render: the tenant's own name,
 * plus the field values behind its currently-live compiled config. Goes
 * through tenant_configs.source_draft_session_id (apps/runtime's
 * promoteDraftToTenant/republishTenantConfig are what set it) to find its
 * way back to the editable draft_configs row — compiled_config itself is
 * the runtime's handlerArgs shape, not the per-field values a form can
 * round-trip through validateDraft()/compile() again.
 *
 * Returns null if the tenant doesn't exist, or if it predates this field
 * (source_draft_session_id was never backfilled for tenants promoted
 * before this existed) — the caller renders a clear explanation rather
 * than a broken form.
 */
export async function getTenantEditorData(tenantId: string): Promise<TenantEditorData | null> {
  const db = createDbClient();
  const repository = createDbRepository(db);

  const tenant = await repository.getTenantById(tenantId);
  if (!tenant || !tenant.sourceDraftSessionId) return null;

  const draftConfig = await getDraftConfig(tenant.sourceDraftSessionId);
  if (!draftConfig) return null;

  return { tenantId: tenant.tenantId, name: tenant.name, draftConfig };
}
