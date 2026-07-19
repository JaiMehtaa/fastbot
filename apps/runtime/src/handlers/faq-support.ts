import { MAIN_MENU_BUTTON, buildButtonMessage, buildListMessage } from "../whatsapp-payload.js";
import { parseIndexedReplyId, type HandlerInput, type HandlerOutput } from "./types.js";

interface Faq {
  question: string;
  answer: string;
}

export type FaqFallbackFn = (question: string, faqs: readonly Faq[]) => Promise<{ answer: string } | null>;

const QUESTION_PREFIX = "faq_";
const BACK_TO_LIST_ID = "back_to_faq_list";

function renderList(waId: string, faqs: readonly Faq[]): HandlerOutput {
  return {
    nextState: "FAQ_MENU",
    outboundPayload: buildListMessage(
      waId,
      "FAQs ❓",
      "Choose a question, or just type your own.",
      "Tap a question",
      "View FAQs",
      faqs.map((faq, index) => ({ id: `${QUESTION_PREFIX}${index}`, title: faq.question })),
    ),
  };
}

/**
 * `fallback` is injected (same DI discipline as everywhere else in this
 * codebase) — the real implementation wires packages/eval's
 * generateWithConfidence() with a separate judge call (per
 * docs/architecture.md "Knowledge Strategy & Confidence/Eval Layer"), but
 * that needs a live OpenRouter key that doesn't exist yet. Returning `null`
 * from `fallback` means "low confidence" and routes to human_escalation,
 * never a possibly-wrong guess shown to the customer.
 */
export function createFaqSupportHandler(fallback: FaqFallbackFn): (input: HandlerInput) => Promise<HandlerOutput> {
  return async function faqSupportHandler(input: HandlerInput): Promise<HandlerOutput> {
    const replyId = input.message.interactiveReplyId;
    const faqs = (input.stateEntry.handlerArgs.faqs as Faq[] | undefined) ?? [];

    if (replyId === "nav_main_menu") {
      return { nextState: "ROOT" };
    }

    const questionIndex = parseIndexedReplyId(replyId, QUESTION_PREFIX);
    const faq = questionIndex !== null ? faqs[questionIndex] : undefined;
    if (faq) {
      return {
        nextState: "FAQ_ANSWER",
        outboundPayload: buildButtonMessage(input.waId, faq.question, faq.answer, [
          { id: BACK_TO_LIST_ID, title: "Back to FAQs ↩️" },
          MAIN_MENU_BUTTON,
        ]),
      };
    }

    if (replyId === undefined && input.message.type === "text" && input.message.text) {
      const result = await fallback(input.message.text, faqs);
      if (result) {
        return {
          nextState: "FAQ_FALLBACK",
          outboundPayload: buildButtonMessage(input.waId, "Here's what I found", result.answer, [
            { id: BACK_TO_LIST_ID, title: "Back to FAQs ↩️" },
            MAIN_MENU_BUTTON,
          ]),
        };
      }
      // low confidence: hand off to human_escalation rather than guess (validateDraft
      // guarantees human_escalation is selected whenever faq_support is)
      return { nextState: "ESCALATION_CONFIRM" };
    }

    // default: initial entry into faq_support, "back to list", or any unrecognized reply
    return renderList(input.waId, faqs);
  };
}
