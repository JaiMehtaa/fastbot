export interface OwnerInfoFieldExtraction {
  value: string;
  /** self-reported confidence (0-1) from the extraction call itself */
  confidence: number;
}

export interface OwnerInfoExtraction {
  name: OwnerInfoFieldExtraction | null;
  contact: OwnerInfoFieldExtraction | null;
}

export type ExtractOwnerInfoFn = (freeText: string) => Promise<OwnerInfoExtraction>;

const CONFIDENCE_THRESHOLD = 0.6;

export interface OwnerInfoCommit {
  name: string | null;
  contact: string | null;
}

/**
 * Owner name/contact aren't part of any PrimitiveSchema (they're operator
 * metadata on draft_sessions — who's setting the bot up — not content the
 * compiled bot ships to WhatsApp), so this is a small, standalone extractor
 * rather than routed through field-extractor.ts's primitive-schema-driven
 * loop. Same reasoning as field-extractor.ts for not routing through
 * packages/eval's generateWithConfidence: name and contact are two
 * independent extractions with independent confidences, not one output to
 * retry as a whole — a low-confidence field simply isn't committed and
 * interview-session.ts asks a single targeted follow-up for whatever's
 * still missing, then moves on regardless (owner info is never allowed to
 * block the interview the way a required primitive field can).
 */
export async function extractOwnerInfo(freeText: string, extractFn: ExtractOwnerInfoFn): Promise<OwnerInfoCommit> {
  const extraction = await extractFn(freeText);
  return {
    name: extraction.name && extraction.name.confidence >= CONFIDENCE_THRESHOLD ? extraction.name.value : null,
    contact: extraction.contact && extraction.contact.confidence >= CONFIDENCE_THRESHOLD ? extraction.contact.value : null,
  };
}
