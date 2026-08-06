import { MAIN_MENU_BUTTON, buildButtonMessage } from "../whatsapp-payload.js";
import type { HandlerInput, HandlerOutput } from "./types.js";

/**
 * One free-text reply, not a multi-step wizard — no server-side scratch
 * memory needed to stitch together name/phone/interest across turns (see
 * booking.ts's own comment on why that pattern only works for enumerable,
 * button/list-driven choices). capture_prompt just asks for everything in
 * one message; whatever the customer sends back becomes the ticket, word
 * for word, the same way faq_support/catalogue read free text off
 * input.message.text rather than trying to parse it.
 */
export async function leadCaptureHandler(input: HandlerInput): Promise<HandlerOutput> {
  const replyId = input.message.interactiveReplyId;
  const capturePrompt =
    typeof input.stateEntry.handlerArgs.capture_prompt === "string"
      ? input.stateEntry.handlerArgs.capture_prompt
      : "Leave your name, phone number, and what you're looking for, and we'll get back to you.";

  if (replyId === "nav_main_menu") {
    return { nextState: "ROOT" };
  }

  if (input.currentState === "LEAD_CAPTURE_CONFIRM") {
    return {
      nextState: "LEAD_CAPTURE_CONFIRM",
      outboundPayload: buildButtonMessage(input.waId, "We're on it 📝", "Our team already has your details and will reach out shortly.", [
        MAIN_MENU_BUTTON,
      ]),
    };
  }

  const trimmedText = input.message.text?.trim();
  if (input.currentState === "LEAD_CAPTURE_START" && input.message.type === "text" && trimmedText) {
    return {
      nextState: "LEAD_CAPTURE_CONFIRM",
      outboundPayload: buildButtonMessage(input.waId, "Thanks! 📝", "We've got your details and will be in touch soon.", [
        MAIN_MENU_BUTTON,
      ]),
      sideEffects: {
        createTicket: { summary: trimmedText },
        notifyDashboard: { type: "lead" },
      },
    };
  }

  // default: initial entry (explicit menu tap, or a stray reply while already in this
  // state that wasn't a text answer) — (re)show the capture prompt
  return {
    nextState: "LEAD_CAPTURE_START",
    outboundPayload: buildButtonMessage(input.waId, "Get in Touch 📝", capturePrompt, [MAIN_MENU_BUTTON]),
  };
}
