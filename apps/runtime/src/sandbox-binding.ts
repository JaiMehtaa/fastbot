import { compile } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import type { RuntimeRepository } from "./repository.js";

export class SandboxBindingError extends Error {}

/** 30 minutes, per docs/architecture.md's "Sandbox Number Multiplexing Mechanism", point 1. */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface IssueSandboxBindingOptions {
  ttlMs?: number;
}

export interface SandboxBindingResult {
  token: string;
  expiresAt: string;
  /** wa.me deep link — tapping it opens WhatsApp with "JOIN <token>" pre-filled, ready to send. */
  joinUrl: string;
}

/**
 * Issues a sandbox join-token so a prospect can test their in-progress bot
 * on real WhatsApp (docs/architecture.md, "Sandbox Number Multiplexing
 * Mechanism", points 1-2). Compiles the draft — reusing packages/compiler's
 * full validateDraft gate, the same one promoteDraftToTenant.ts uses. A
 * dedicated "partial validity" gate that would let an incomplete draft
 * preview early (per the compiler design's three-gates note) is real future
 * scope, not built here — for now, "ready to sandbox-test" and "ready to go
 * live" are the same bar.
 *
 * This is the issuing side of the flow; the consumption side
 * (handleSandboxJoin/resolveContext in context-resolver.ts, which binds an
 * incoming "JOIN <token>" text to this token) already exists.
 */
export async function issueSandboxBinding(
  draft: DraftConfig,
  sandboxWhatsAppNumber: string,
  repository: RuntimeRepository,
  options: IssueSandboxBindingOptions = {},
): Promise<SandboxBindingResult> {
  let compiledConfig;
  try {
    compiledConfig = compile(draft, draft.draftSessionId);
  } catch (error) {
    throw new SandboxBindingError(`Cannot issue a sandbox binding for an invalid draft: ${(error as Error).message}`);
  }

  const { token, expiresAt } = await repository.createDraftWaBinding({
    draftSessionId: draft.draftSessionId,
    compiledConfig,
    ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
  });

  const joinUrl = `https://wa.me/${sandboxWhatsAppNumber}?text=${encodeURIComponent(`JOIN ${token}`)}`;
  return { token, expiresAt, joinUrl };
}
