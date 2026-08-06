import { randomBytes } from "node:crypto";
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

export interface CreateTenantInput {
  name: string;
  phoneNumberId: string;
  compiledConfig: CompiledConfig;
  /** The draft session this tenant was promoted from — lets the dashboard editor (republishTenant) find its way back to the editable field values in draft_configs. */
  sourceDraftSessionId?: string;
}

export interface TenantDetails {
  tenantId: string;
  name: string;
  phoneNumberId: string | null;
  status: string;
  sourceDraftSessionId: string | null;
}

export interface RepublishTenantInput {
  tenantId: string;
  compiledConfig: CompiledConfig;
  sourceDraftSessionId: string;
  /** When set, also updates tenants.name — otherwise the dashboard's bot list/edit header keeps showing a stale name after an edit. */
  name?: string;
}

export interface CreateDraftWaBindingInput {
  draftSessionId: string;
  compiledConfig: CompiledConfig;
  ttlMs: number;
}

export type BookingStatus = "held" | "confirmed" | "cancelled";

export interface BookingRecord {
  id: string;
  contextType: ConversationContextType;
  contextId: string;
  waId: string;
  service: string;
  /** "_default" sentinel when the business has no named providers — see the bookings migration's own comment for why this is never null */
  provider: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  heldUntil: string | null;
  reminderSentAt: string | null;
}

export interface CreateHoldInput {
  contextType: ConversationContextType;
  contextId: string;
  waId: string;
  service: string;
  provider: string;
  startsAt: string;
  endsAt: string;
  heldUntil: string;
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
  /** The compile+publish gate (docs/architecture.md, "BSP Recommendation": "triggers the
   * compile+publish gate") — creates a live tenant from an already-compiled config. */
  createTenant(input: CreateTenantInput): Promise<{ tenantId: string }>;
  getTenantById(tenantId: string): Promise<TenantDetails | null>;
  /** Sibling to createTenant (which only ever writes tenant_configs version 1) — the dashboard
   * editor's save path, publishing a new tenant_configs version live immediately. */
  republishTenant(input: RepublishTenantInput): Promise<{ version: number }>;
  /**
   * draft_sessions.status has a documented terminal state machine (in_progress
   * -> testing -> promoted/abandoned/expired), but promoteDraftToTenant never
   * actually set it — found live via QA testing that a fully-promoted session
   * stayed 'in_progress' forever, contradicting code elsewhere that assumed
   * the primary interview->promote path reaches 'promoted'.
   */
  markDraftSessionPromoted(draftSessionId: string): Promise<void>;
  /** Issuing side of the sandbox join-token flow (docs/architecture.md, "Sandbox
   * Number Multiplexing Mechanism", points 1-2) — stores the compiled draft and
   * creates a pending, time-limited binding a prospect can bind to by texting
   * "JOIN <token>" to the shared sandbox number (see handleSandboxJoin). */
  createDraftWaBinding(input: CreateDraftWaBindingInput): Promise<{ token: string; expiresAt: string }>;
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
  /**
   * The customer's own most recent free-text message, if any — used by
   * human_escalation to put what the customer actually asked into the
   * support ticket instead of always repeating the tenant's static
   * escalation_prompt back at itself (found live via QA testing: a human
   * agent opening the ticket had no way to see the real question). Returns
   * null when there's no prior text message (e.g. an explicit "Talk to Us"
   * tap with nothing said yet) — the static prompt remains the fallback.
   */
  getLastInboundText(contextType: ConversationContextType, contextId: string, waId: string): Promise<string | null>;

  /** Active = confirmed, or held with an unexpired hold — an expired hold is silently treated as free, no cleanup job needed. */
  listActiveBookings(contextType: ConversationContextType, contextId: string, fromIso: string, toIso: string): Promise<BookingRecord[]>;
  /** Returns null on conflict (the slot's no longer free) — apps/runtime/src/handlers/booking.ts re-renders availability rather than erroring. */
  createHold(input: CreateHoldInput): Promise<BookingRecord | null>;
  /** Returns null if the hold no longer exists or already expired. */
  confirmBooking(bookingId: string): Promise<BookingRecord | null>;
  cancelBooking(bookingId: string): Promise<void>;
  /** Not scoped to one context — the reminder sweep (dev-start.ts) runs across every tenant at once. */
  listBookingsNeedingReminder(withinMs: number, now: Date): Promise<BookingRecord[]>;
  markReminderSent(bookingId: string): Promise<void>;
}

export interface InMemoryRuntimeRepository extends RuntimeRepository {
  readonly tenantsByPhoneNumberId: Map<string, TenantLookup>;
  readonly tenantsById: Map<string, TenantDetails>;
  readonly draftsBySessionId: Map<string, CompiledConfig>;
  readonly waBindings: Map<string, DraftWaBinding>;
  readonly conversationStates: Map<string, ConversationState>;
  readonly chatHistory: ChatHistoryEntry[];
  readonly supportTickets: (SupportTicketInput & { id: string })[];
  readonly dashboardNotifications: DashboardNotificationInput[];
  readonly bookings: BookingRecord[];
  readonly draftSessionStatuses: Map<string, string>;
}

function conversationStateKey(contextType: ConversationContextType, contextId: string, waId: string): string {
  return `${contextType}:${contextId}:${waId}`;
}

export function createInMemoryRepository(): InMemoryRuntimeRepository {
  const tenantsByPhoneNumberId = new Map<string, TenantLookup>();
  const tenantsById = new Map<string, TenantDetails>();
  const tenantVersions = new Map<string, number>();
  const draftsBySessionId = new Map<string, CompiledConfig>();
  const waBindings = new Map<string, DraftWaBinding>();
  const conversationStates = new Map<string, ConversationState>();
  const chatHistory: ChatHistoryEntry[] = [];
  const supportTickets: (SupportTicketInput & { id: string })[] = [];
  const dashboardNotifications: DashboardNotificationInput[] = [];
  const bookings: BookingRecord[] = [];
  const draftSessionStatuses = new Map<string, string>();
  let ticketCounter = 0;
  let tenantCounter = 0;
  let bookingCounter = 0;

  function isActive(booking: BookingRecord, now: number): boolean {
    if (booking.status === "confirmed") return true;
    if (booking.status === "held" && booking.heldUntil && new Date(booking.heldUntil).getTime() > now) return true;
    return false;
  }

  function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
  }

  return {
    tenantsByPhoneNumberId,
    tenantsById,
    draftsBySessionId,
    waBindings,
    conversationStates,
    chatHistory,
    supportTickets,
    dashboardNotifications,
    bookings,
    draftSessionStatuses,

    async getTenantByPhoneNumberId(phoneNumberId) {
      return tenantsByPhoneNumberId.get(phoneNumberId) ?? null;
    },

    async markDraftSessionPromoted(draftSessionId) {
      draftSessionStatuses.set(draftSessionId, "promoted");
    },

    async createTenant(input) {
      tenantCounter += 1;
      const tenantId = `tenant-${tenantCounter}`;
      tenantsByPhoneNumberId.set(input.phoneNumberId, { tenantId, compiledConfig: input.compiledConfig });
      tenantsById.set(tenantId, {
        tenantId,
        name: input.name,
        phoneNumberId: input.phoneNumberId,
        status: "live",
        sourceDraftSessionId: input.sourceDraftSessionId ?? null,
      });
      tenantVersions.set(tenantId, 1);
      return { tenantId };
    },

    async getTenantById(tenantId) {
      return tenantsById.get(tenantId) ?? null;
    },

    async republishTenant(input) {
      const existing = tenantsById.get(input.tenantId);
      if (!existing) throw new Error(`republishTenant: unknown tenant ${input.tenantId}`);

      const nextVersion = (tenantVersions.get(input.tenantId) ?? 1) + 1;
      tenantVersions.set(input.tenantId, nextVersion);
      tenantsById.set(input.tenantId, {
        ...existing,
        sourceDraftSessionId: input.sourceDraftSessionId,
        name: input.name ?? existing.name,
      });
      if (existing.phoneNumberId) {
        tenantsByPhoneNumberId.set(existing.phoneNumberId, { tenantId: input.tenantId, compiledConfig: input.compiledConfig });
      }
      return { version: nextVersion };
    },

    async createDraftWaBinding(input) {
      draftsBySessionId.set(input.draftSessionId, input.compiledConfig);
      const token = randomBytes(4).toString("hex");
      const expiresAt = new Date(Date.now() + input.ttlMs).toISOString();
      waBindings.set(token, { token, draftSessionId: input.draftSessionId, waId: null, status: "pending", expiresAt });
      return { token, expiresAt };
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

    async getLastInboundText(contextType, contextId, waId) {
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const entry = chatHistory[i]!;
        if (entry.contextType !== contextType || entry.contextId !== contextId || entry.waId !== waId) continue;
        if (entry.direction !== "inbound") continue;
        const payload = entry.payload as { type?: string; text?: string } | undefined;
        if (payload?.type === "text" && typeof payload.text === "string" && payload.text.trim()) {
          return payload.text;
        }
      }
      return null;
    },

    async listActiveBookings(contextType, contextId, fromIso, toIso) {
      const now = Date.now();
      return bookings.filter(
        (b) =>
          b.contextType === contextType &&
          b.contextId === contextId &&
          isActive(b, now) &&
          overlaps(b.startsAt, b.endsAt, fromIso, toIso),
      );
    },

    async createHold(input) {
      const now = Date.now();
      const conflict = bookings.some(
        (b) =>
          b.contextId === input.contextId &&
          b.provider === input.provider &&
          isActive(b, now) &&
          overlaps(b.startsAt, b.endsAt, input.startsAt, input.endsAt),
      );
      if (conflict) return null;

      bookingCounter += 1;
      const record: BookingRecord = {
        id: `booking-${bookingCounter}`,
        contextType: input.contextType,
        contextId: input.contextId,
        waId: input.waId,
        service: input.service,
        provider: input.provider,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "held",
        heldUntil: input.heldUntil,
        reminderSentAt: null,
      };
      bookings.push(record);
      return record;
    },

    async confirmBooking(bookingId) {
      const now = Date.now();
      const record = bookings.find((b) => b.id === bookingId);
      if (!record || record.status !== "held" || !record.heldUntil || new Date(record.heldUntil).getTime() <= now) {
        return null;
      }
      record.status = "confirmed";
      record.heldUntil = null;
      return record;
    },

    async cancelBooking(bookingId) {
      const record = bookings.find((b) => b.id === bookingId);
      if (record) record.status = "cancelled";
    },

    async listBookingsNeedingReminder(withinMs, now) {
      const cutoff = now.getTime() + withinMs;
      return bookings.filter((b) => {
        if (b.status !== "confirmed" || b.reminderSentAt) return false;
        const startsAtMs = new Date(b.startsAt).getTime();
        return startsAtMs >= now.getTime() && startsAtMs <= cutoff;
      });
    },

    async markReminderSent(bookingId) {
      const record = bookings.find((b) => b.id === bookingId);
      if (record) record.reminderSentAt = new Date().toISOString();
    },
  };
}
