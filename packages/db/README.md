# packages/db — Supabase/Postgres Client, Types, Migrations

Shared Supabase/Postgres access layer. Tables (see `/docs/architecture.md` → Data Model for full detail):

- Prospect/build-time: `draft_sessions`, `draft_configs`, `primitive_registry`, `lob_recipes`, `draft_wa_bindings`
- Account/dashboard: `accounts`, `admin_accounts`, `account_tenants`, `dashboard_notifications`, `support_tickets`
- Live tenant: `tenants`, `tenant_configs`
- Shared, context-scoped (`(context_type: 'draft'|'tenant', context_id, wa_id)`): `conversation_state`, `chat_history`

Migrations live here; generated TS types are consumed by every `apps/*` and `packages/*` module that touches the database.
