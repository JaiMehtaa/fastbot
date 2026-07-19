import { findLobRecipe } from "@whatsapp-bot-platform/schema";
import { validateDraft } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig, PrimitiveFieldValues, PrimitiveKey, ValidationResult } from "@whatsapp-bot-platform/shared-types";

export type GenerateFieldValuesFn = (context: {
  lobKey: string;
  primitiveKey: PrimitiveKey;
  attempt: number;
}) => Promise<PrimitiveFieldValues>;

export interface GenerateGroundTruthOptions {
  lobKey: string;
  generateFieldValues: GenerateFieldValuesFn;
  maxAttemptsPerPrimitive?: number;
}

/**
 * Generates a ground-truth DraftConfig for a chosen LOB recipe — one that is
 * guaranteed to actually pass packages/compiler's validateDraft, not just
 * assumed to. This is the TS equivalent of the instructor+retry pattern:
 * each primitive's generated fields are probed against the real validator
 * and regenerated on failure (up to maxAttemptsPerPrimitive), then the full
 * assembled draft gets one final validation pass to catch cross-primitive
 * constraints (e.g. booking needs business_info.hours) that a single
 * primitive's fields can't surface on their own.
 */
export async function generateGroundTruthDraft(options: GenerateGroundTruthOptions): Promise<DraftConfig> {
  const { lobKey, generateFieldValues, maxAttemptsPerPrimitive = 3 } = options;
  const recipe = findLobRecipe(lobKey);
  if (!recipe) {
    throw new Error(`Unknown lob_recipe: "${lobKey}"`);
  }

  const fieldValues: DraftConfig["fieldValues"] = {};

  for (const primitiveKey of recipe.defaultPrimitives) {
    let accepted = false;
    let lastValidation: ValidationResult | undefined;

    for (let attempt = 1; attempt <= maxAttemptsPerPrimitive && !accepted; attempt++) {
      const values = await generateFieldValues({ lobKey, primitiveKey, attempt });
      const probe: DraftConfig = {
        draftSessionId: "synthetic-probe",
        version: 1,
        lobKey,
        selectedPrimitives: [primitiveKey],
        fieldValues: { [primitiveKey]: values },
      };
      lastValidation = validateDraft(probe);
      if (lastValidation.valid) {
        fieldValues[primitiveKey] = values;
        accepted = true;
      }
    }

    if (!accepted) {
      const errorCount = lastValidation?.issues.filter((issue) => issue.severity === "error").length ?? 0;
      throw new Error(
        `Failed to generate valid field values for primitive "${primitiveKey}" ` +
          `after ${maxAttemptsPerPrimitive} attempts: ` +
          `${lastValidation?.missingRequiredFields.length ?? 0} missing field(s), ${errorCount} error(s).`,
      );
    }
  }

  const draft: DraftConfig = {
    draftSessionId: `synthetic-${lobKey}-${Date.now()}`,
    version: 1,
    lobKey,
    selectedPrimitives: recipe.defaultPrimitives,
    fieldValues,
  };

  const finalValidation = validateDraft(draft);
  if (!finalValidation.valid) {
    const errorCount = finalValidation.issues.filter((issue) => issue.severity === "error").length;
    throw new Error(
      `Generated ground-truth draft for lobKey "${lobKey}" failed full validation ` +
        `(cross-primitive constraint likely): ${finalValidation.missingRequiredFields.length} missing field(s), ` +
        `${errorCount} error(s).`,
    );
  }

  return draft;
}
