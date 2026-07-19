import type {
  ChatHistoryStatus,
  CompiledConfig,
  ConversationContextType,
  ConversationState,
  DashboardNotificationType,
} from "@whatsapp-bot-platform/shared-types";

export interface TenantLookup {
  tenantId: string;
  compiledConfig: CompiledConfig;
}

export interface DraftLookup {
  draftSessionId: string;
  compiledConfig: CompiledConfig;
}

export interface DraftWaBinding {
  token: string;
  draftSessionId: string;
  waId: string | null;
  status: "pending" | "bound" | "expired";
  expiresAt: string;
}

export interface ChatHistoryEntry {
  contextType: ConversationContextType;
  contextId: string;
  waId: string;
  messageId: string;
  direction: "inbound" | "outbound";
  payload: unknown;
  status: string;
}

export interface DashboardNotificationInput {
  tenantId: string;
  type: DashboardNotificationType;
  refId: string;
}

export interface SupportTicketInput {
  contextType: ConversationContextType;
  contextId: string;
  waId: string;
  summary: string;
}

/**
 * Everything apps/runtime needs from the database, behind one interface —
 * same dependency-injection discipline as packages/eval's generate/score
 * functions. No live Supabase project exists yet (see packages/db), so all
 * of apps/runtime's own tests run against createInMemoryRepository() below;
 * a real packages/db-backed implementation is a direct, mechanical follow-up
 * once a Supabase project exists, not a redesign.
 */
export interface RuntimeRepository {
  getTenantByPhoneNumberId(phoneNumberId: string): Promise<TenantLookup | null>;
  getDraftWaBinding(token: string): Promise<DraftWaBinding | null>;
  bindDraftWaBinding(token: string, waId: string): Promise<DraftLookup | null>;
  getBoundDraftByWaId(waId: string): Promise<DraftLookup | null>;

  getConversationState(
    contextType: ConversationContextType,
    contextId: string,
    waId: string,
  ): Promise<ConversationState | null>;
  upsertConversationState(state: ConversationState): Promise<void>;

  insertChatHistory(entry: ChatHistoryEntry): Promise<void>;
  /**
   * WhatsApp message ids (wamid.*) are globally unique per Meta's own ID
   * scheme, and a delivery-status webhook carries only the message id — not
   * which tenant/draft it belongs to — so this looks up by message id alone,
   * matching the Pittie reference workflow's "Supabase: Update Status" node.
   */
  updateChatHistoryStatusByMessageId(messageId: string, status: ChatHistoryStatus): Promise<void>;

  insertSupportTicket(ticket: SupportTicketInput): Promise<{ id: string }>;
  insertDashboardNotification(notification: DashboardNotificationInput): Promise<void>;
}

export interface InMemoryRuntimeRepository extends RuntimeRepository {
  readonly tenantsByPhoneNumberId: Map<string, TenantLookup>;
  readonly draftsBySessionId: Map<string, CompiledConfig>;
  readonly waBindings: Map<string, DraftWaBinding>;
  readonly conversationStates: Map<string, ConversationState>;
  readonly chatHistory: ChatHistoryEntry[];
  readonly supportTickets: (SupportTicketInput & { id: string })[];
  readonly dashboardNotifications: DashboardNotificationInput[];
}

function conversationStateKey(contextType: ConversationContextType, contextId: string, waId: string): string {
  return `${contextType}:${contextId}:${waId}`;
}

export function createInMemoryRepository(): InMemoryRuntimeRepository {
  const tenantsByPhoneNumberId = new Map<string, TenantLookup>();
  const draftsBySessionId = new Map<string, CompiledConfig>();
  const waBindings = new Map<string, DraftWaBinding>();
  const conversationStates = new Map<string, ConversationState>();
  const chatHistory: ChatHistoryEntry[] = [];
  const supportTickets: (SupportTicketInput & { id: string })[] = [];
  const dashboardNotifications: DashboardNotificationInput[] = [];
  let ticketCounter = 0;

  return {
    tenantsByPhoneNumberId,
    draftsBySessionId,
    waBindings,
    conversationStates,
    chatHistory,
    supportTickets,
    dashboardNotifications,

    async getTenantByPhoneNumberId(phoneNumberId) {
      return tenantsByPhoneNumberId.get(phoneNumberId) ?? null;
    },

    async getDraftWaBinding(token) {
      return waBindings.get(token) ?? null;
    },

    async bindDraftWaBinding(token, waId) {
      const binding = waBindings.get(token);
      if (!binding || binding.status !== "pending" || new Date(binding.expiresAt).getTime() < Date.now()) {
        return null;
      }
      waBindings.set(token, { ...binding, waId, status: "bound" });
      const compiledConfig = draftsBySessionId.get(binding.draftSessionId);
      if (!compiledConfig) return null;
      return { draftSessionId: binding.draftSessionId, compiledConfig };
    },

    async getBoundDraftByWaId(waId) {
      for (const binding of waBindings.values()) {
        if (binding.status === "bound" && binding.waId === waId) {
          const compiledConfig = draftsBySessionId.get(binding.draftSessionId);
          if (!compiledConfig) return null;
          return { draftSessionId: binding.draftSessionId, compiledConfig };
        }
      }
      return null;
    },

    async getConversationState(contextType, contextId, waId) {
      return conversationStates.get(conversationStateKey(contextType, contextId, waId)) ?? null;
    },

    async upsertConversationState(state) {
      conversationStates.set(conversationStateKey(state.contextType, state.contextId, state.waId), state);
    },

    async insertChatHistory(entry) {
      chatHistory.push(entry);
    },

    async updateChatHistoryStatusByMessageId(messageId, status) {
      const entry = chatHistory.find((e) => e.messageId === messageId);
      if (entry) entry.status = status;
    },

    async insertSupportTicket(ticket) {
      ticketCounter += 1;
      const id = `ticket-${ticketCounter}`;
      supportTickets.push({ ...ticket, id });
      return { id };
    },

    async insertDashboardNotification(notification) {
      dashboardNotifications.push(notification);
    },
  };
}
