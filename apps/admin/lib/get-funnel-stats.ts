import { createDbClient } from "@whatsapp-bot-platform/db";

export interface FunnelStats {
  draftSessionsByStatus: Record<string, number>;
  sandboxBindingsByStatus: Record<string, number>;
  distinctConversations: { draft: number; tenant: number };
  totalMessages: { draft: number; tenant: number };
}

function tally<T>(rows: readonly T[], keyFn: (row: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

/**
 * The concrete answer to "how many chat sessions happened in guest
 * sessions" — draft_sessions.status is the top of the funnel (every
 * anonymous prospect who opened the interview, whether or not they ever
 * signed up), draft_wa_bindings.status is "did they reach the real-WhatsApp
 * sandbox test," and chat_history's context_type ('draft' vs 'tenant') is
 * the cleanest guest-vs-live split in the whole schema (a hard check
 * constraint, not an inferred nullable-FK convention — see draft_sessions.
 * tenant_id, which is NOT a reliable guest/live signal on its own since
 * it's also set for authenticated post-launch dashboard edits).
 *
 * Aggregated in application code, not SQL GROUP BY — supabase-js's query
 * builder doesn't expose it, and at this scale (dozens–low hundreds of
 * rows today) fetching the narrow columns needed and tallying in JS is
 * simpler than an RPC function, with a clear scaling ceiling to revisit
 * once chat_history is large.
 */
export async function getFunnelStats(): Promise<FunnelStats> {
  const db = createDbClient();

  const { data: draftSessions, error: dsError } = await db.from("draft_sessions").select("status");
  if (dsError) throw new Error(`getFunnelStats (draft_sessions): ${dsError.message}`);

  const { data: bindings, error: bindingsError } = await db.from("draft_wa_bindings").select("status");
  if (bindingsError) throw new Error(`getFunnelStats (draft_wa_bindings): ${bindingsError.message}`);

  const { data: chatRows, error: chatError } = await db.from("chat_history").select("context_type, context_id, wa_id");
  if (chatError) throw new Error(`getFunnelStats (chat_history): ${chatError.message}`);

  const totalMessages = { draft: 0, tenant: 0 };
  const conversationKeys = { draft: new Set<string>(), tenant: new Set<string>() };
  for (const row of chatRows ?? []) {
    const bucket: "draft" | "tenant" = row.context_type === "tenant" ? "tenant" : "draft";
    totalMessages[bucket] += 1;
    conversationKeys[bucket].add(`${row.context_id}:${row.wa_id}`);
  }

  return {
    draftSessionsByStatus: tally(draftSessions ?? [], (r) => r.status),
    sandboxBindingsByStatus: tally(bindings ?? [], (r) => r.status),
    distinctConversations: { draft: conversationKeys.draft.size, tenant: conversationKeys.tenant.size },
    totalMessages,
  };
}
