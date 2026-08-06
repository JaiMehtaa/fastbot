import type { ExtractOwnerInfoFn } from "./owner-info-extractor.js";

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_PATTERN = /\+?\d[\d\s-]{7,}\d/;
const NAME_FILLER = /^(i'?m|i am|this is|my name is|name'?s)\s+/i;

/**
 * Local, no-LLM stand-in for real owner-info extraction — same role
 * heuristic-extractor.ts plays for primitive fields: keeps the interview
 * runnable end to end without an OpenAI key. Regex-based, genuinely
 * limited; swap for createLlmExtractOwnerInfo in production.
 */
export const heuristicExtractOwnerInfo: ExtractOwnerInfoFn = async (freeText) => {
  const emailMatch = EMAIL_PATTERN.exec(freeText);
  const phoneMatch = !emailMatch ? PHONE_PATTERN.exec(freeText) : null;
  const contactMatch = emailMatch ?? phoneMatch;

  const withoutContact = contactMatch ? freeText.replace(contactMatch[0], " ") : freeText;
  const nameCandidate = withoutContact
    .split(/[,.;]| and /i)[0]
    ?.replace(NAME_FILLER, "")
    .trim();

  return {
    name: nameCandidate ? { value: nameCandidate, confidence: 0.75 } : null,
    contact: contactMatch ? { value: contactMatch[0].trim(), confidence: 0.8 } : null,
  };
};
