-- A sandbox binding needs to serve the generic interpreter the same way a
-- live tenant does (docs/architecture.md's "one runtime engine" rule) — that
-- means a *compiled* config, not the raw draft field_values that live on
-- draft_configs. This mirrors tenant_configs.compiled_config exactly, just
-- scoped to one sandbox binding instead of a tenant: apps/runtime's
-- issueSandboxBinding() compiles the draft once at issue time and stores the
-- result here, so serving a sandbox conversation never recompiles per
-- message.
alter table draft_wa_bindings add column compiled_config jsonb not null default '{}'::jsonb;
alter table draft_wa_bindings alter column compiled_config drop default;
