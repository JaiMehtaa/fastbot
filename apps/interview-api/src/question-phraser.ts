export interface PhraseContext {
  /** the functional, static text to convey — meaning must be preserved exactly */
  rawText: string;
  ownerName?: string | null;
  businessName?: string | null;
}

/**
 * Must never throw and must never return an empty string — every call site
 * in interview-session.ts treats this as "give me the nicest phrasing you
 * can, worst case hand back rawText unchanged." A phrasing failure is
 * cosmetic, never a reason to break a turn.
 */
export type PhraseQuestionFn = (context: PhraseContext) => Promise<string>;

/**
 * Zero-config default: the interview functions correctly on the raw,
 * static interviewHint/summary/prompt text alone — this is what
 * createServer() falls back to without an OpenAI key, same role every
 * other heuristic-*.ts default plays elsewhere in this codebase.
 */
export const identityPhraseQuestion: PhraseQuestionFn = async ({ rawText }) => rawText;
