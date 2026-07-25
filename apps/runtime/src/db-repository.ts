import { randomBytes } from "node:crypto";
import type { DbClient } from "@whatsapp-bot-platform/db";
import type { CompiledConfig } from "@whatsapp-bot-platform/shared-types";
import type {
  ChatHistoryEntry,
  CreateDraftWaBindingInput,
  CreateTenantInput,
  DashboardNotificationInput,
  DraftLookup,
  DraftWaBinding,
  RuntimeRepository,
  SupportTicketInput,
  TenantLookup,
} from "./repository.js";

export class DbRepositoryError extends Error {}

/**
 * Real, Supabase/Postgres-backed RuntimeRepository — fulfills the exact
 * interface createInMemoryRepository() implements (apps/runtime/src/repository.ts),
 * so nothing above the repository layer (context-resolver, process-inbound-message,
 * promote-tenant, sandbox-binding) needs to know or care which one it's talking to.
 *
 * `createDraftWaBinding` deliberately does NOT create the `draft_sessions` row
 * it references — that table's lifecycle belongs to apps/interview-api's
 * DbSessionStore (the interview is what actually owns a draft), so a missing
 * row here means a genuine ordering bug upstream and should fail loudly via
 * the foreign-key violation, not be silently papered over.
 *
 * `createTenant`'s two inserts (tenants, then tenant_configs) are not wrapped
 * in a transaction — supabase-js's REST layer doesn't support client-side
 * multi-statement transactions without a database function. A failure
 * between the two inserts could leave a tenant without a config; a real fix
 * is an RPC-wrapped transaction, deliberately not built for this MVP phase.
 */
export function createDbRepository(db: DbClient): RuntimeRepository {
  return {
    async getTenantByPhoneNumberId(phoneNumberId) {
      const { data: tenant, error: tenantError } = await db
        .from("tenants")
        .select("id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (tenantError) throw new DbRepositoryError(`getTenantByPhoneNumberId: ${tenantError.message}`);
      if (!tenant) return null;

      const { data: config, error: configError } = await db
        .from("tenant_configs")
        .select("compiled_config")
        .eq("tenant_id", tenant.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (configError) throw new DbRepositoryError(`getTenantByPhoneNumberId (config): ${configError.message}`);
      if (!config) return null;

      return { tenantId: tenant.id, compiledConfig: config.compiled_config as unknown as CompiledConfig };
    },

    async createTenant(input: CreateTenantInput) {
      const { data: tenant, error: tenantError } = await db
        .from("tenants")
        .insert({ name: input.name, phone_number_id: input.phoneNumberId, status: "live", published_at: new Date().toISOString() })
        .select("id")
        .single();
      if (tenantError || !tenant) throw new DbRepositoryError(`createTenant: ${tenantError?.message}`);

      const { error: configError } = await db
        .from("tenant_configs")
        .insert({ tenant_id: tenant.id, version: 1, compiled_config: input.compiledConfig as unknown as never });
      if (configError) throw new DbRepositoryError(`createTenant (tenant_configs): ${configError.message}`);

      return { tenantId: tenant.id };
    },

    async createDraftWaBinding(input: CreateDraftWaBindingInput) {
      const token = randomBytes(4).toString("hex");
      const expiresAt = new Date(Date.now() + input.ttlMs).toISOString();
      const { error } = await db.from("draft_wa_bindings").insert({
        token,
        draft_session_id: input.draftSessionId,
        status: "pending",
        expires_at: expiresAt,
        compiled_config: input.compiledConfig as unknown as never,
      });
      if (error) throw new DbRepositoryError(`createDraftWaBinding: ${error.message}`);
      return { token, expiresAt };
    },

    async getDraftWaBinding(token: string): Promise<DraftWaBinding | null> {
      const { data, error } = await db.from("draft_wa_bindings").select("*").eq("token", token).maybeSingle();
      if (error) throw new DbRepositoryError(`getDraftWaBinding: ${error.message}`);
      if (!data) return null;
      return {
        token: data.token,
        draftSessionId: data.draft_session_id,
        waId: data.wa_id,
        status: data.status as DraftWaBinding["status"],
        expiresAt: data.expires_at,
      };
    },

    async bindDraftWaBinding(token: string, waId: string): Promise<DraftLookup | null> {
      // A single conditional UPDATE (not select-then-update) so "pending and
      // unexpired" is checked atomically against whatever's true at write
      // time, not a moment earlier. A conflict with the partial unique index
      // on (wa_id) WHERE status='bound' (one wa_id, one active binding —
      // docs/architecture.md's collision-handling rule) resolves to null,
      // same as any other invalid join, not an unhandled exception — a
      // second device trying to bind mid-test is an expected case, not a bug.
      const { data, error } = await db
        .from("draft_wa_bindings")
        .update({ wa_id: waId, status: "bound" })
        .eq("token", token)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .select("draft_session_id, compiled_config")
        .maybeSingle();

      if (error) {
        if (error.code === "23505") return null; // unique_violation on the active-binding index
        throw new DbRepositoryError(`bindDraftWaBinding: ${error.message}`);
      }
      if (!data) return null;
      return { draftSessionId: data.draft_session_id, compiledConfig: data.compiled_config as unknown as CompiledConfig };
    },

    async getBoundDraftByWaId(waId: string): Promise<DraftLookup | null> {
      const { data, error } = await db
        .from("draft_wa_bindings")
        .select("draft_session_id, compiled_config")
        .eq("wa_id", waId)
        .eq("status", "bound")
        .maybeSingle();
      if (error) throw new DbRepositoryError(`getBoundDraftByWaId: ${error.message}`);
      if (!data) return null;
      return { draftSessionId: data.draft_session_id, compiledConfig: data.compiled_config as unknown as CompiledConfig };
    },

    async getConversationState(contextType, contextId, waId) {
      const { data, error } = await db
        .from("conversation_state")
        .select("*")
        .eq("context_type", contextType)
        .eq("context_id", contextId)
        .eq("wa_id", waId)
        .maybeSingle();
      if (error) throw new DbRepositoryError(`getConversationState: ${error.message}`);
      if (!data) return null;
      return {
        contextType: data.context_type as "draft" | "tenant",
        contextId: data.context_id,
        waId: data.wa_id,
        currentState: data.current_state,
        lastInteraction: data.last_interaction,
        pendingMsgId: data.pending_msg_id ?? undefined,
      };
    },

    async upsertConversationState(state) {
      const { error } = await db.from("conversation_state").upsert(
        {
          context_type: state.contextType,
          context_id: state.contextId,
          wa_id: state.waId,
          current_state: state.currentState,
          last_interaction: state.lastInteraction,
          pending_msg_id: state.pendingMsgId ?? null,
        },
        { onConflict: "context_type,context_id,wa_id" },
      );
      if (error) throw new DbRepositoryError(`upsertConversationState: ${error.message}`);
    },

    async insertChatHistory(entry: ChatHistoryEntry) {
      const { error } = await db.from("chat_history").insert({
        context_type: entry.contextType,
        context_id: entry.contextId,
        wa_id: entry.waId,
        message_id: entry.messageId,
        direction: entry.direction,
        payload: entry.payload as never,
        status: entry.status,
      });
      if (error) throw new DbRepositoryError(`insertChatHistory: ${error.message}`);
    },

    async updateChatHistoryStatusByMessageId(messageId, status) {
      const { error } = await db.from("chat_history").update({ status }).eq("message_id", messageId);
      if (error) throw new DbRepositoryError(`updateChatHistoryStatusByMessageId: ${error.message}`);
    },

    async insertSupportTicket(ticket: SupportTicketInput) {
      const { data, error } = await db
        .from("support_tickets")
        .insert({ context_type: ticket.contextType, context_id: ticket.contextId, wa_id: ticket.waId, summary: ticket.summary })
        .select("id")
        .single();
      if (error || !data) throw new DbRepositoryError(`insertSupportTicket: ${error?.message}`);
      return { id: data.id };
    },

    async insertDashboardNotification(notification: DashboardNotificationInput) {
      const { error } = await db
        .from("dashboard_notifications")
        .insert({ tenant_id: notification.tenantId, type: notification.type, ref_id: notification.refId });
      if (error) throw new DbRepositoryError(`insertDashboardNotification: ${error.message}`);
    },
  };
}
