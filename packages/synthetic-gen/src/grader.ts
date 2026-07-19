import { getPrimitive, primitiveRegistry } from "@whatsapp-bot-platform/schema";
import type { DraftConfig, FieldDefinition } from "@whatsapp-bot-platform/shared-types";

export type FieldMatchStatus = "match" | "mismatch" | "missing";

export interface FieldMatchResult {
  primitiveKey: string;
  fieldKey: string;
  status: FieldMatchStatus;
  groundTruthValue: unknown;
  candidateValue: unknown;
}

export interface GradeReport {
  fieldResults: readonly FieldMatchResult[];
  matchedCount: number;
  totalCount: number;
  /** matchedCount / totalCount, 1 when there was nothing to grade */
  score: number;
}

export type TextComparator = (groundTruth: string, candidate: string) => boolean;

/**
 * No-LLM, no-embeddings default: normalized token-overlap (Jaccard similarity).
 * Good enough to distinguish "same idea, reworded" from "a different answer
 * entirely" without any external dependency — swap in an LLM-judge comparator
 * later if this proves too coarse.
 */
export function defaultTextComparator(groundTruth: string, candidate: string): boolean {
  const normalize = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(Boolean));
  const a = normalize(groundTruth);
  const b = normalize(candidate);
  if (a.size === 0 || b.size === 0) return a.size === b.size;

  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  const unionSize = a.size + b.size - overlap;

  return overlap / unionSize >= 0.3;
}

function valuesMatch(field: FieldDefinition, groundTruth: unknown, candidate: unknown, textComparator: TextComparator): boolean {
  if (field.type === "text") {
    return textComparator(String(groundTruth), String(candidate));
  }
  return JSON.stringify(groundTruth) === JSON.stringify(candidate);
}

/**
 * Grades a candidate DraftConfig (e.g. what an interview agent produced)
 * against a ground-truth DraftConfig, field by field. Pure and deterministic
 * by default — no LLM call, no network — so it runs in CI on every commit,
 * unlike the generation side of packages/synthetic-gen.
 *
 * Only fields present in the ground truth are scored: a field the ground
 * truth doesn't specify isn't part of the test's claim, so it's silently
 * skipped rather than counted as a mismatch.
 */
export function gradeDraftConfig(
  groundTruth: DraftConfig,
  candidate: DraftConfig,
  options: { textComparator?: TextComparator } = {},
): GradeReport {
  const textComparator = options.textComparator ?? defaultTextComparator;
  const fieldResults: FieldMatchResult[] = [];

  for (const primitiveKey of groundTruth.selectedPrimitives) {
    if (!primitiveRegistry[primitiveKey]) continue;
    const schema = getPrimitive(primitiveKey);
    const groundTruthValues = groundTruth.fieldValues[primitiveKey] ?? {};
    const candidateValues = candidate.fieldValues[primitiveKey] ?? {};

    for (const field of [...schema.requiredFields, ...schema.optionalFields]) {
      const groundTruthValue = groundTruthValues[field.key];
      if (groundTruthValue === undefined || groundTruthValue === null) continue;

      const candidateValue = candidateValues[field.key];
      let status: FieldMatchStatus;
      if (candidateValue === undefined || candidateValue === null) {
        status = "missing";
      } else if (valuesMatch(field, groundTruthValue, candidateValue, textComparator)) {
        status = "match";
      } else {
        status = "mismatch";
      }

      fieldResults.push({ primitiveKey, fieldKey: field.key, status, groundTruthValue, candidateValue });
    }
  }

  const matchedCount = fieldResults.filter((r) => r.status === "match").length;
  const totalCount = fieldResults.length;

  return {
    fieldResults,
    matchedCount,
    totalCount,
    score: totalCount === 0 ? 1 : matchedCount / totalCount,
  };
}
