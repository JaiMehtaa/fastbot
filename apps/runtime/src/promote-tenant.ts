import { compile, validateDraft } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import type { RuntimeRepository } from "./repository.js";

export class PromotionError extends Error {}

/**
 * The compile+publish gate (docs/architecture.md, "BSP Recommendation" and
 * "Data Model" -> "Promotion"): turns a completed interview's DraftConfig
 * into a live, servable tenant. Runs the same full-validation gate
 * compile() already enforces internally — failing loudly here, before
 * calling compile() at all, gives a clearer error than letting compile()'s
 * own internal check throw a more generic message.
 */
export async function promoteDraftToTenant(
  draft: DraftConfig,
  phoneNumberId: string,
  repository: RuntimeRepository,
): Promise<{ tenantId: string }> {
  const validation = validateDraft(draft);
  if (!validation.valid) {
    const errorCount = validation.issues.filter((issue) => issue.severity === "error").length;
    throw new PromotionError(
      `Cannot promote an invalid draft (session "${draft.draftSessionId}"): ` +
        `${validation.missingRequiredFields.length} missing required field(s), ${errorCount} error(s).`,
    );
  }

  const compiledConfig = compile(draft, draft.draftSessionId);
  const businessName =
    typeof draft.fieldValues.business_info?.business_name === "string"
      ? draft.fieldValues.business_info.business_name
      : "New Business";

  return repository.createTenant({ name: businessName, phoneNumberId, compiledConfig });
}
