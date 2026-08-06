import { MAIN_MENU_BUTTON, buildButtonMessage } from "../whatsapp-payload.js";
import type { HandlerInput, HandlerOutput } from "./types.js";

/**
 * hours is a free-form key->range map (e.g. `{mon_fri: "9-18", sat: "9-14",
 * sun: "closed"}`, or full day names, or a single "note" key) — the same
 * open-ended shorthand `expandBusinessHours` (packages/compiler) parses for
 * booking. This just needs a readable label per key, not a resolved
 * per-day schedule, so a light humanize (underscores -> dashes, capitalize)
 * is enough — "mon_fri" -> "Mon-Fri", not raw JSON dumped into the chat.
 */
function humanizeHoursKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function formatHours(hours: Record<string, unknown>): string {
  return Object.entries(hours)
    .map(([key, value]) => `${humanizeHoursKey(key)}: ${String(value)}`)
    .join(", ");
}

export async function businessInfoHandler(input: HandlerInput): Promise<HandlerOutput> {
  if (input.message.interactiveReplyId === "nav_main_menu") {
    return { nextState: "ROOT" };
  }

  const args = input.stateEntry.handlerArgs;
  const businessName = typeof args.business_name === "string" ? args.business_name : "our business";
  const lines: string[] = [];
  if (typeof args.description === "string") lines.push(args.description);
  if (args.hours && typeof args.hours === "object") lines.push(`Hours: ${formatHours(args.hours as Record<string, unknown>)}`);
  if (typeof args.location === "string") lines.push(`Location: ${args.location}`);
  if (typeof args.contact_phone === "string") lines.push(`Phone: ${args.contact_phone}`);
  if (typeof args.contact_email === "string") lines.push(`Email: ${args.contact_email}`);
  if (typeof args.website === "string") lines.push(`Website: ${args.website}`);

  return {
    nextState: "BUSINESS_INFO_VIEW",
    outboundPayload: buildButtonMessage(input.waId, `About ${businessName} ℹ️`, lines.join("\n"), [MAIN_MENU_BUTTON]),
  };
}
