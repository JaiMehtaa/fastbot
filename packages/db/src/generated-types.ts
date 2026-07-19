/**
 * Hand-written placeholder matching Supabase's `supabase gen types typescript`
 * output shape, kept in sync with migrations/0001_core_schema.sql by hand
 * until a real Supabase project exists to generate this for real. Replace
 * this whole file with the CLI's output at that point — do not keep both.
 */

type TableDef<Row, DefaultedKeys extends keyof Row> = {
  Row: Row;
  Insert: Omit<Row, DefaultedKeys> & Partial<Pick<Row, DefaultedKeys>>;
  Update: Partial<Row>;
};

export interface TenantRow {
  id: string;
  name: string;
  status: "draft" | "live" | "suspended";
  phone_number_id: string | null;
  bsp_provider: string | null;
  pricing_tier: string;
  published_at: string | null;
  created_at: string;
}

export interface TenantConfigRow {
  id: string;
  tenant_id: string;
  version: number;
  compiled_config: Record<string, unknown>;
  source_draft_session_id: string | null;
  compiled_at: string;
}

export interface DraftSessionRow {
  id: string;
  status: "in_progress" | "testing" | "promoted" | "abandoned" | "expired";
  owner_contact: string | null;
  tenant_id: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface DraftConfigRow {
  id: string;
  draft_session_id: string;
  version: number;
  lob_key: string | null;
  selected_primitives: string[];
  field_values: Record<string, unknown>;
  last_validation: Record<string, unknown> | null;
  created_at: string;
}

export interface DraftWaBindingRow {
  token: string;
  draft_session_id: string;
  wa_id: string | null;
  status: "pending" | "bound" | "expired";
  expires_at: string;
  created_at: string;
}

export interface AccountTenantRow {
  account_id: string;
  tenant_id: string;
  role: "owner" | "member";
  created_at: string;
}

export interface AdminAccountRow {
  id: string;
  role: "admin" | "superadmin";
  created_at: string;
}

export interface SupportTicketRow {
  id: string;
  context_type: "draft" | "tenant";
  context_id: string;
  wa_id: string;
  summary: string;
  status: "open" | "resolved";
  created_at: string;
}

export interface DashboardNotificationRow {
  id: string;
  tenant_id: string;
  type: "escalation" | "delivery_failure" | "config_validation_warning";
  ref_id: string;
  status: "unread" | "read" | "resolved";
  created_at: string;
}

export interface ConversationStateRow {
  context_type: "draft" | "tenant";
  context_id: string;
  wa_id: string;
  current_state: string;
  last_interaction: string;
  pending_msg_id: string | null;
}

export interface ChatHistoryRow {
  id: string;
  context_type: "draft" | "tenant";
  context_id: string;
  wa_id: string;
  message_id: string;
  direction: "inbound" | "outbound";
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      tenants: TableDef<TenantRow, "id" | "status" | "pricing_tier" | "created_at">;
      tenant_configs: TableDef<TenantConfigRow, "id" | "version" | "compiled_at">;
      draft_sessions: TableDef<DraftSessionRow, "id" | "status" | "created_at">;
      draft_configs: TableDef<
        DraftConfigRow,
        "id" | "version" | "selected_primitives" | "field_values" | "created_at"
      >;
      draft_wa_bindings: TableDef<DraftWaBindingRow, "status" | "created_at">;
      account_tenants: TableDef<AccountTenantRow, "role" | "created_at">;
      admin_accounts: TableDef<AdminAccountRow, "role" | "created_at">;
      support_tickets: TableDef<SupportTicketRow, "id" | "status" | "created_at">;
      dashboard_notifications: TableDef<DashboardNotificationRow, "id" | "status" | "created_at">;
      conversation_state: TableDef<ConversationStateRow, "current_state" | "last_interaction">;
      chat_history: TableDef<ChatHistoryRow, "id" | "status" | "created_at">;
    };
  };
}
