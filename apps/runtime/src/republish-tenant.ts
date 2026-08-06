import { compile, validateDraft } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import type { RuntimeRepository } from "./repository.js";

export class RepublishError extends Error {}

/**
 * The dashboard editor's save path — sibling to promoteDraftToTenant, but
 * for an already-live tenant. Runs the exact same validate-then-compile
 * gate (see promote-tenant.ts's own comment on why the explicit check
 * happens before compile() rather than only relying on compile()'s
 * internal one), then publishes a new tenant_configs version instead of
 * creating a new tenant.
 */
export async function republishTenantConfig(
  draft: DraftConfig,
  tenantId: string,
  repository: RuntimeRepository,
): Promise<{ version: number }> {
  const validation = validateDraft(draft);
  if (!validation.valid) {
    const errorCount = validation.issues.filter((issue) => issue.severity === "error").length;
    throw new RepublishError(
      `Cannot republish an invalid draft (session "${draft.draftSessionId}"): ` +
        `${validation.missingRequiredFields.length} missing required field(s), ${errorCount} error(s).`,
    );
  }

  const compiledConfig = compile(draft, draft.draftSessionId);
  // Same derivation promoteDraftToTenant uses — without this, editing "Business name"
  // in the dashboard editor updates the live bot's own greeting but leaves the
  // dashboard's tenant list and edit-page header showing the original name forever
  // (found live via QA testing: tenants.name is a separate column republishTenant
  // never touched).
  const businessName =
    typeof draft.fieldValues.business_info?.business_name === "string"
      ? draft.fieldValues.business_info.business_name
      : undefined;

  return repository.republishTenant({
    tenantId,
    compiledConfig,
    sourceDraftSessionId: draft.draftSessionId,
    name: businessName,
  });
}
