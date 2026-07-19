import { MAIN_MENU_BUTTON, buildButtonMessage } from "../whatsapp-payload.js";
import type { HandlerInput, HandlerOutput } from "./types.js";

export async function businessInfoHandler(input: HandlerInput): Promise<HandlerOutput> {
  if (input.message.interactiveReplyId === "nav_main_menu") {
    return { nextState: "ROOT" };
  }

  const args = input.stateEntry.handlerArgs;
  const businessName = typeof args.business_name === "string" ? args.business_name : "our business";
  const lines: string[] = [];
  if (typeof args.description === "string") lines.push(args.description);
  if (args.hours) lines.push(`Hours: ${JSON.stringify(args.hours)}`);
  if (typeof args.location === "string") lines.push(`Location: ${args.location}`);
  if (typeof args.contact_phone === "string") lines.push(`Phone: ${args.contact_phone}`);
  if (typeof args.contact_email === "string") lines.push(`Email: ${args.contact_email}`);
  if (typeof args.website === "string") lines.push(`Website: ${args.website}`);

  return {
    nextState: "BUSINESS_INFO_VIEW",
    outboundPayload: buildButtonMessage(input.waId, `About ${businessName} ℹ️`, lines.join("\n"), [MAIN_MENU_BUTTON]),
  };
}
