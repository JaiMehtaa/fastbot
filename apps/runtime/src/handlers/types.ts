import type { DashboardNotificationType, InboundMessage, StateTableEntry } from "@whatsapp-bot-platform/shared-types";
import type { WhatsAppOutboundMessage } from "../whatsapp-payload.js";

export interface HandlerInput {
  waId: string;
  currentState: string;
  message: InboundMessage;
  stateEntry: StateTableEntry;
}

export interface HandlerOutput {
  nextState: string;
  /** absent + nextState === "ROOT" means: the interpreter renders the root menu itself */
  outboundPayload?: WhatsAppOutboundMessage;
  sideEffects?: {
    createTicket?: { summary: string };
    notifyDashboard?: { type: DashboardNotificationType };
  };
}

export type PrimitiveHandler = (input: HandlerInput) => Promise<HandlerOutput>;

/** Parses a `${prefix}<index>` reply id into a valid array index, or null if it doesn't match. */
export function parseIndexedReplyId(replyId: string | undefined, prefix: string): number | null {
  if (!replyId || !replyId.startsWith(prefix)) return null;
  const index = Number(replyId.slice(prefix.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}
