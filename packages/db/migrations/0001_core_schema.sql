-- Core schema for the AI-driven WhatsApp bot builder.
-- Matches docs/architecture.md's "Data Model (conceptual)" section.
--
-- Deliberately NOT included here: `primitive_registry` and `lob_recipes`.
-- Those stay code-authored in packages/schema for the MVP (see "Admin Panel
-- Design": "Read-first for MVP; editing/versioning primitive schemas from
-- this UI (vs. code) is a reasonable fast-follow, not required on day one").
-- Turning them into real tables is a deliberate later migration, not an
-- oversight here.
--
-- RLS is enabled on every table with no policies yet (safe-by-default: only
-- the service-role key can access anything until real policies are added,
-- which should happen once it's known which tables a client actually needs
-- direct Supabase-client access to, vs. going through apps/interview-api or
-- apps/runtime).

-- ============================================================
-- Live tenant
-- ============================================================

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'live', 'suspended')),
  phone_number_id text unique,
  bsp_provider text,
  pricing_tier text not null default 'free',
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index tenants_phone_number_id_idx on tenants (phone_number_id);
alter table tenants enable row level security;

create table tenant_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  version int not null default 1,
  compiled_config jsonb not null,
  source_draft_session_id uuid,
  compiled_at timestamptz not null default now(),
  unique (tenant_id, version)
);
create index tenant_configs_tenant_id_idx on tenant_configs (tenant_id);
alter table tenant_configs enable row level security;

-- ============================================================
-- Prospect / build-time
-- ============================================================

create table draft_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'testing', 'promoted', 'abandoned', 'expired')),
  owner_contact text,
  -- set once this draft is a post-launch edit against an existing tenant
  -- (the dashboard bot editor), null for an anonymous pre-signup draft
  tenant_id uuid references tenants (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index draft_sessions_tenant_id_idx on draft_sessions (tenant_id);
alter table draft_sessions enable row level security;

alter table tenant_configs
  add constraint tenant_configs_source_draft_session_id_fkey
  foreign key (source_draft_session_id) references draft_sessions (id) on delete set null;

create table draft_configs (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid not null references draft_sessions (id) on delete cascade,
  version int not null default 1,
  lob_key text,
  selected_primitives text[] not null default '{}',
  field_values jsonb not null default '{}'::jsonb,
  last_validation jsonb,
  created_at timestamptz not null default now(),
  unique (draft_session_id, version)
);
create index draft_configs_draft_session_id_idx on draft_configs (draft_session_id);
alter table draft_configs enable row level security;

create table draft_wa_bindings (
  token text primary key,
  draft_session_id uuid not null references draft_sessions (id) on delete cascade,
  wa_id text,
  status text not null default 'pending' check (status in ('pending', 'bound', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index draft_wa_bindings_wa_id_idx on draft_wa_bindings (wa_id);
-- enforces "one wa_id holds one active binding at a time" (Sandbox Number
-- Multiplexing Mechanism, point 6) at the database level, not just in
-- application code
create unique index draft_wa_bindings_active_wa_id_idx on draft_wa_bindings (wa_id) where status = 'bound';
alter table draft_wa_bindings enable row level security;

-- ============================================================
-- Account / dashboard
-- ============================================================
-- No separate `accounts` table: customer identity is Supabase Auth's
-- built-in auth.users, per the plan ("accounts — login identity
-- (Supabase Auth)"). account_tenants maps that identity to a tenant.

create table account_tenants (
  account_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (account_id, tenant_id)
);
create index account_tenants_tenant_id_idx on account_tenants (tenant_id);
alter table account_tenants enable row level security;

-- Separately authenticated from customer accounts (per "Admin Panel
-- Design"): reuses Supabase Auth's login mechanics (auth.users) for the
-- session/token machinery, but authorization is gated by membership in
-- this table — a customer's auth.users row never appears here, so there's
-- no second auth system to stand up and operate.
create table admin_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);
alter table admin_accounts enable row level security;

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('draft', 'tenant')),
  context_id uuid not null,
  wa_id text not null,
  summary text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
create index support_tickets_context_idx on support_tickets (context_type, context_id);
alter table support_tickets enable row level security;

-- ref_id polymorphically points into support_tickets OR chat_history, so it
-- deliberately has no foreign key (can't reference two tables at once).
create table dashboard_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  type text not null check (type in ('escalation', 'delivery_failure', 'config_validation_warning')),
  ref_id uuid not null,
  status text not null default 'unread' check (status in ('unread', 'read', 'resolved')),
  created_at timestamptz not null default now()
);
create index dashboard_notifications_tenant_id_idx on dashboard_notifications (tenant_id);
create index dashboard_notifications_status_idx on dashboard_notifications (status);
alter table dashboard_notifications enable row level security;

-- ============================================================
-- Shared by both draft and live runtime (context-scoped, not
-- duplicated per surface — same tables serve sandbox and live traffic)
-- ============================================================

create table conversation_state (
  context_type text not null check (context_type in ('draft', 'tenant')),
  context_id uuid not null,
  wa_id text not null,
  current_state text not null default 'ROOT',
  last_interaction timestamptz not null default now(),
  pending_msg_id text,
  primary key (context_type, context_id, wa_id)
);
alter table conversation_state enable row level security;

create table chat_history (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('draft', 'tenant')),
  context_id uuid not null,
  wa_id text not null,
  message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  payload jsonb not null,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  unique (context_type, context_id, message_id)
);
create index chat_history_context_idx on chat_history (context_type, context_id, wa_id);
alter table chat_history enable row level security;
