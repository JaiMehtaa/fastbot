import { findLobRecipe } from "@whatsapp-bot-platform/schema";
import { validateDraft } from "@whatsapp-bot-platform/compiler";
import { generateWithConfidence } from "@whatsapp-bot-platform/eval";
import type { GenerateAttempt } from "@whatsapp-bot-platform/eval";
import type { DraftConfig, PrimitiveFieldValues, PrimitiveKey, ValidationResult } from "@whatsapp-bot-platform/shared-types";

export type GenerateFieldValuesFn = (context: {
  lobKey: string;
  primitiveKey: PrimitiveKey;
  attempt: number;
  previousAttempts: readonly GenerateAttempt<PrimitiveFieldValues>[];
}) => Promise<PrimitiveFieldValues>;

export interface GenerateGroundTruthOptions {
  lobKey: string;
  generateFieldValues: GenerateFieldValuesFn;
  maxAttemptsPerPrimitive?: number;
}

function summarizeValidationFailure(validation: ValidationResult): string {
  const errorCount = validation.issues.filter((issue) => issue.severity === "error").length;
  return `${validation.missingRequiredFields.length} missing field(s), ${errorCount} error(s)`;
}

/**
 * Generates a ground-truth DraftConfig for a chosen LOB recipe — one that is
 * guaranteed to actually pass packages/compiler's validateDraft, not just
 * assumed to. Each primitive's fields are generated through the same shared
 * generateWithConfidence() every other LLM call site in the system uses (see
 * packages/eval): "confidence" here is just pass/fail from validateDraft,
 * with the validation summary threaded back as feedback for the next retry.
 * Primitives don't depend on each other, so they generate concurrently; a
 * final validation pass on the assembled draft catches cross-primitive
 * constraints (e.g. booking needs business_info.hours) no single primitive's
 * fields can surface on their own.
 */
export async function generateGroundTruthDraft(options: GenerateGroundTruthOptions): Promise<DraftConfig> {
  const { lobKey, generateFieldValues, maxAttemptsPerPrimitive = 3 } = options;
  const recipe = findLobRecipe(lobKey);
  if (!recipe) {
    throw new Error(`Unknown lob_recipe: "${lobKey}"`);
  }

  const generated = await Promise.all(
    recipe.defaultPrimitives.map(async (primitiveKey): Promise<[PrimitiveKey, PrimitiveFieldValues]> => {
      const result = await generateWithConfidence<PrimitiveFieldValues>({
        generate: async ({ attempt, previousAttempts }) => ({
          output: await generateFieldValues({ lobKey, primitiveKey, attempt, previousAttempts }),
          confidence: 0, // authoritative confidence comes from score() below, not self-reported
        }),
        score: async (values) => {
          const probe: DraftConfig = {
            draftSessionId: "synthetic-probe",
            version: 1,
            lobKey,
            selectedPrimitives: [primitiveKey],
            fieldValues: { [primitiveKey]: values },
          };
          const validation = validateDraft(probe);
          return {
            confidence: validation.valid ? 1 : 0,
            reason: validation.valid ? undefined : summarizeValidationFailure(validation),
          };
        },
        threshold: 1,
        maxAttempts: maxAttemptsPerPrimitive,
      });

      if (result.status === "low_confidence") {
        throw new Error(
          `Failed to generate valid field values for primitive "${primitiveKey}" ` +
            `after ${maxAttemptsPerPrimitive} attempts: ${result.lastReason ?? "validation failed"}.`,
        );
      }

      return [primitiveKey, result.output];
    }),
  );

  const draft: DraftConfig = {
    draftSessionId: `synthetic-${lobKey}-${Date.now()}`,
    version: 1,
    lobKey,
    selectedPrimitives: recipe.defaultPrimitives,
    fieldValues: Object.fromEntries(generated),
  };

  const finalValidation = validateDraft(draft);
  if (!finalValidation.valid) {
    throw new Error(
      `Generated ground-truth draft for lobKey "${lobKey}" failed full validation ` +
        `(cross-primitive constraint likely): ${summarizeValidationFailure(finalValidation)}.`,
    );
  }

  return draft;
}
