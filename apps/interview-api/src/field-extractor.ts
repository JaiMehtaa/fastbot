import type { MissingField, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";

export interface FieldExtraction {
  primitiveKey: PrimitiveKey;
  fieldKey: string;
  value: unknown;
  /** self-reported confidence (0-1) from the extraction call itself */
  confidence: number;
  reason?: string;
}

export type ExtractFieldsFn = (context: {
  freeText: string;
  missingFields: readonly MissingField[];
}) => Promise<readonly FieldExtraction[]>;

const FIELD_CONFIDENCE_THRESHOLD = 0.6;

export interface ExtractionResult {
  committed: readonly FieldExtraction[];
  lowConfidence: readonly FieldExtraction[];
}

/**
 * Extracts zero or more fields from one turn's free text (a single message
 * can plausibly answer several missing fields at once, e.g. "we're Zap Home
 * Care, open 9-7 daily" answers both business_name and hours). Deliberately
 * does NOT route through packages/eval's generateWithConfidence: that
 * primitive gates a single output against a single confidence value, and
 * there's no single output here to retry — extraction returns an
 * independent confidence per field, and a low-confidence field simply isn't
 * committed (docs/architecture.md, "Knowledge Strategy & Confidence/Eval
 * Layer": "stays in missingRequiredFields and the next turn asks a
 * clarifying follow-up, reusing the existing missing-field-driven loop").
 * Same kind of deliberate scope boundary as packages/synthetic-gen's
 * persona.ts not routing through generateWithConfidence.
 */
export async function extractFields(
  freeText: string,
  missingFields: readonly MissingField[],
  extractFn: ExtractFieldsFn,
): Promise<ExtractionResult> {
  const extractions = await extractFn({ freeText, missingFields });
  const committed: FieldExtraction[] = [];
  const lowConfidence: FieldExtraction[] = [];

  for (const extraction of extractions) {
    if (extraction.confidence >= FIELD_CONFIDENCE_THRESHOLD) {
      committed.push(extraction);
    } else {
      lowConfidence.push(extraction);
    }
  }

  return { committed, lowConfidence };
}
