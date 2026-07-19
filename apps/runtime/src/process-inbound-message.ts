import type { InboundMessage } from "@whatsapp-bot-platform/shared-types";
import type { BspAdapter } from "./bsp-adapter.js";
import { handleSandboxJoin, resolveContext, type ResolvedContext } from "./context-resolver.js";
import type { createInterpreter } from "./interpreter.js";
import type { RuntimeRepository } from "./repository.js";

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface ProcessInboundMessageDeps {
  repository: RuntimeRepository;
  bspAdapter: BspAdapter;
  interpret: ReturnType<typeof createInterpreter>;
  sandboxPhoneNumberId: string;
  now?: () => Date;
}

export type ProcessInboundMessageResult =
  | { status: "processed" }
  | { status: "sandbox_join_prompt" }
  | { status: "unknown_number" };

/**
 * The full inbound path (docs/architecture.md, "Runtime Engine Design"):
 * context resolution -> 24h expiry check -> generic interpreter -> the
 * send->log->set-state triplet, preserved exactly as the Pittie reference
 * workflow does it -> side effects (ticket + dashboard notification) on
 * escalation. Identical code whether the traffic is a prospect testing on
 * the shared sandbox number or a real customer messaging a live tenant.
 */
export async function processInboundMessage(
  phoneNumberId: string,
  message: InboundMessage,
  deps: ProcessInboundMessageDeps,
): Promise<ProcessInboundMessageResult> {
  const now = deps.now ?? (() => new Date());

  if (phoneNumberId === deps.sandboxPhoneNumberId && message.type === "text" && message.text) {
    const joinResult = await handleSandboxJoin(message.text, message.waId, deps.repository);
    if (joinResult.joined && joinResult.context) {
      await runTurn(joinResult.context, message, deps, now);
      return { status: "processed" };
    }
  }

  const resolution = await resolveContext(phoneNumberId, message.waId, deps.sandboxPhoneNumberId, deps.repository);
  if (resolution.kind === "unknown_number") return { status: "unknown_number" };
  if (resolution.kind === "sandbox_join_required") return { status: "sandbox_join_prompt" };

  await runTurn(resolution.context, message, deps, now);
  return { status: "processed" };
}

async function runTurn(
  context: ResolvedContext,
  message: InboundMessage,
  deps: ProcessInboundMessageDeps,
  now: () => Date,
): Promise<void> {
  const { repository, bspAdapter, interpret } = deps;

  const existingState = await repository.getConversationState(context.contextType, context.contextId, message.waId);
  const isExpired =
    existingState !== null && now().getTime() - new Date(existingState.lastInteraction).getTime() > SESSION_EXPIRY_MS;
  const currentState = existingState && !isExpired ? existingState.currentState : "ROOT";

  await repository.insertChatHistory({
    contextType: context.contextType,
    contextId: context.contextId,
    waId: message.waId,
    messageId: message.messageId,
    direction: "inbound",
    payload: message,
    status: "received",
  });

  const result = await interpret(context.compiledConfig, currentState, message.waId, message);
  if (!result.outboundPayload) {
    throw new Error("interpret() returned no outboundPayload — this should be unreachable, see interpreter.ts");
  }

  const sendResult = await bspAdapter.send(result.outboundPayload);

  await repository.insertChatHistory({
    contextType: context.contextType,
    contextId: context.contextId,
    waId: message.waId,
    messageId: sendResult.messageId,
    direction: "outbound",
    payload: result.outboundPayload,
    status: "sent",
  });

  await repository.upsertConversationState({
    contextType: context.contextType,
    contextId: context.contextId,
    waId: message.waId,
    currentState: result.nextState,
    lastInteraction: now().toISOString(),
  });

  if (result.sideEffects?.createTicket) {
    const ticket = await repository.insertSupportTicket({
      contextType: context.contextType,
      contextId: context.contextId,
      waId: message.waId,
      summary: result.sideEffects.createTicket.summary,
    });
    // dashboard_notifications.tenant_id is NOT NULL — a draft/sandbox context has no
    // tenant yet, so notifications only fire for real, live tenants.
    if (result.sideEffects.notifyDashboard && context.contextType === "tenant") {
      await repository.insertDashboardNotification({
        tenantId: context.contextId,
        type: result.sideEffects.notifyDashboard.type,
        refId: ticket.id,
      });
    }
  }
}
