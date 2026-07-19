import { MAIN_MENU_BUTTON, buildButtonMessage } from "../whatsapp-payload.js";
import type { HandlerInput, HandlerOutput } from "./types.js";

const CONFIRM_ID = "escalation_confirm";

export async function humanEscalationHandler(input: HandlerInput): Promise<HandlerOutput> {
  const replyId = input.message.interactiveReplyId;
  const args = input.stateEntry.handlerArgs;
  const prompt = typeof args.escalation_prompt === "string" ? args.escalation_prompt : "Someone will reach out shortly.";

  if (input.currentState === "ESCALATION_ACTIVE") {
    return {
      nextState: "ESCALATION_ACTIVE",
      outboundPayload: buildButtonMessage(
        input.waId,
        "We're on it 🎧",
        "Our team already has your message and will reach out shortly.",
        [MAIN_MENU_BUTTON],
      ),
    };
  }

  if (replyId === "nav_main_menu") {
    return { nextState: "ROOT" };
  }

  if (replyId === CONFIRM_ID) {
    return {
      nextState: "ESCALATION_ACTIVE",
      outboundPayload: buildButtonMessage(input.waId, "Connecting you 🎧", prompt, [MAIN_MENU_BUTTON]),
      sideEffects: { createTicket: { summary: prompt }, notifyDashboard: { type: "escalation" } },
    };
  }

  // default: initial entry into human_escalation (either an explicit menu tap or a
  // handoff from faq_support's low-confidence fallback), or any unrecognized reply
  return {
    nextState: "ESCALATION_CONFIRM",
    outboundPayload: buildButtonMessage(input.waId, "Talk to Us 🎧", prompt, [
      { id: CONFIRM_ID, title: "Yes, connect me" },
      MAIN_MENU_BUTTON,
    ]),
  };
}
