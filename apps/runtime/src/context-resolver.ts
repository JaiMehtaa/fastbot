import type { CompiledConfig, ConversationContextType } from "@whatsapp-bot-platform/shared-types";
import type { RuntimeRepository } from "./repository.js";

export interface ResolvedContext {
  contextType: ConversationContextType;
  contextId: string;
  compiledConfig: CompiledConfig;
}

export type ContextResolution =
  | { kind: "resolved"; context: ResolvedContext }
  | { kind: "sandbox_join_required" }
  | { kind: "unknown_number" };

/**
 * The one place "is this a draft being tested, or a live tenant" gets
 * decided (docs/architecture.md, "Architecture: Four Pillars"). Everything
 * downstream — conversation_state, the generic interpreter, the
 * send->log->set-state triplet — is identical code afterward, keyed only by
 * the resolved {contextType, contextId}.
 */
export async function resolveContext(
  phoneNumberId: string,
  waId: string,
  sandboxPhoneNumberId: string,
  repository: RuntimeRepository,
): Promise<ContextResolution> {
  if (phoneNumberId === sandboxPhoneNumberId) {
    const bound = await repository.getBoundDraftByWaId(waId);
    if (!bound) {
      return { kind: "sandbox_join_required" };
    }
    return {
      kind: "resolved",
      context: { contextType: "draft", contextId: bound.draftSessionId, compiledConfig: bound.compiledConfig },
    };
  }

  const tenant = await repository.getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    return { kind: "unknown_number" };
  }
  return {
    kind: "resolved",
    context: { contextType: "tenant", contextId: tenant.tenantId, compiledConfig: tenant.compiledConfig },
  };
}

const JOIN_COMMAND_PATTERN = /^\s*JOIN\s+(\S+)\s*$/i;

export interface SandboxJoinResult {
  joined: boolean;
  context?: ResolvedContext;
}

/**
 * Handles the wa.me deep-link join flow (Sandbox Number Multiplexing
 * Mechanism, points 1-6): a prospect's first message to the shared sandbox
 * number is "JOIN <token>", which binds their wa_id to a draft session.
 */
export async function handleSandboxJoin(
  text: string,
  waId: string,
  repository: RuntimeRepository,
): Promise<SandboxJoinResult> {
  const match = JOIN_COMMAND_PATTERN.exec(text);
  if (!match) {
    return { joined: false };
  }

  const token = match[1] as string;
  const bound = await repository.bindDraftWaBinding(token, waId);
  if (!bound) {
    return { joined: false };
  }

  return {
    joined: true,
    context: { contextType: "draft", contextId: bound.draftSessionId, compiledConfig: bound.compiledConfig },
  };
}
