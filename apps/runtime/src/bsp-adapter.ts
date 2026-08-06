import { randomUUID } from "node:crypto";
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

/**
 * messageId is a random UUID, not a sequential per-instance counter — a
 * counter restarting at 1 every process lifetime collided with rows
 * already sitting in chat_history's real (context_type, context_id,
 * message_id) uniqueness constraint from a *previous* process's outbound
 * messages to the same tenant, since createDbRepository persists across
 * restarts even though this mock adapter doesn't. Found live by restarting
 * apps/runtime's dev server against a real, already-used tenant.
 */
export function createMockBspAdapter(): MockBspAdapter {
  const sentMessages: WhatsAppOutboundMessage[] = [];

  return {
    sentMessages,
    async send(message) {
      sentMessages.push(message);
      return { messageId: `mock-msg-${randomUUID()}` };
    },
  };
}
