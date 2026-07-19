import type { WhatsAppOutboundMessage } from "./whatsapp-payload.js";

export interface SendResult {
  messageId: string;
}

/**
 * Abstraction over the BSP (360dialog per docs/architecture.md's "BSP
 * Recommendation", Twilio as fallback for the sandbox number). No real
 * adapter exists yet — no BSP account is set up — so apps/runtime is built
 * and tested entirely against createMockBspAdapter() below, per the plan's
 * own "Synthetic Data Bootstrap" guidance: "Build a mock BSP adapter (same
 * interface, in-memory events) so M0–M2 run in CI without touching real
 * WhatsApp/BSP rate limits."
 */
export interface BspAdapter {
  send(message: WhatsAppOutboundMessage): Promise<SendResult>;
}

export interface MockBspAdapter extends BspAdapter {
  readonly sentMessages: readonly WhatsAppOutboundMessage[];
}

export function createMockBspAdapter(): MockBspAdapter {
  const sentMessages: WhatsAppOutboundMessage[] = [];
  let counter = 0;

  return {
    sentMessages,
    async send(message) {
      sentMessages.push(message);
      counter += 1;
      return { messageId: `mock-msg-${counter}` };
    },
  };
}
