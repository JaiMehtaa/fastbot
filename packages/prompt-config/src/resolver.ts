import type { DbClient } from "@whatsapp-bot-platform/db";
import { getPromptTemplate } from "./store.js";

export type PromptResolverFn = () => Promise<string>;

const CACHE_TTL_MS = 30_000;

/**
 * Every llm-*.ts call site takes a zero-arg `() => Promise<string>` for its
 * editable instructions, same DI discipline as every other injected
 * function in this codebase (ClassifyCapabilitiesFn, ExtractFieldsFn, ...)
 * — the call site never knows a database is involved. A short in-memory
 * TTL cache means an admin edit takes effect within 30s without a restart,
 * while a live interview turn (which can already involve 2-3 sequential
 * LLM calls) doesn't pay a DB round-trip on every single call.
 *
 * Fails open, not closed: if the DB read errors (network blip, DB down),
 * this falls back to `fallback` rather than breaking the turn — a prompt
 * override is an operator convenience, never a hard dependency for the
 * interview to function.
 */
export function createPromptTemplateResolver(
  db: DbClient,
  key: string,
  fallback: string,
  ttlMs: number = CACHE_TTL_MS,
): PromptResolverFn {
  let cached: { value: string; fetchedAt: number } | null = null;

  return async function resolve(): Promise<string> {
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      return cached.value;
    }
    let value: string;
    try {
      value = (await getPromptTemplate(db, key)) ?? fallback;
    } catch {
      value = fallback;
    }
    cached = { value, fetchedAt: Date.now() };
    return value;
  };
}
