import type { PrimitiveKey, PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";
import type { ClassifyCapabilitiesFn } from "./capability-classifier.js";

/**
 * Local, no-LLM stand-in for real capability classification — same role
 * heuristic-classifier.ts played for LOB classification: keeps the interview
 * flow runnable end-to-end without an OpenAI key. Primitive schemas don't
 * carry classification examples the way lob_recipes did, so this matches on
 * a small fixed keyword set per primitive instead of token overlap. Swap for
 * createLlmClassifyCapabilities in production; nothing else changes since
 * capability-classifier.ts only depends on the function shape.
 */
const KEYWORDS: Partial<Record<PrimitiveKey, readonly string[]>> = {
  catalogue: ["sell", "product", "products", "shop", "store", "buy", "catalogue", "catalog", "inventory"],
  faq_support: ["question", "questions", "faq", "faqs", "support", "policy", "shipping", "returns"],
  booking: ["appointment", "appointments", "book", "booking", "schedule", "slot", "reservation"],
  lead_capture: ["lead", "leads", "inquiry", "inquiries", "enquiry", "quote", "callback"],
};

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter((token) => token.length > 2));
}

export const heuristicClassifyCapabilities: ClassifyCapabilitiesFn = async (freeText, candidates) => {
  const tokens = tokenize(freeText);
  const selectedPrimitives: PrimitiveKey[] = [];

  for (const schema of candidates) {
    const keywords = KEYWORDS[schema.key];
    if (!keywords) continue;
    if (keywords.some((keyword) => tokens.has(keyword))) {
      selectedPrimitives.push(schema.key);
    }
  }

  if (selectedPrimitives.length === 0) {
    return { selectedPrimitives: [], confidence: 0.2, reason: "no keyword match against any registered primitive" };
  }

  return {
    selectedPrimitives,
    confidence: 0.75,
    reason: `keyword match for: ${selectedPrimitives.join(", ")}`,
  };
};
