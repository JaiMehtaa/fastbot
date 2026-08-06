-- Backing store for apps/admin's prompt-management UI
-- (packages/prompt-config): lets the platform operator edit the
-- instructional framing behind each LLM call site (question phrasing,
-- capability classification, field extraction, owner-info extraction, the
-- FAQ fallback's tone) without a code deploy. Absence of a row for a given
-- key means "use the code-owned default" — every call site keeps its own
-- hardcoded fallback, this table only ever holds operator overrides.
create table prompt_templates (
  key text primary key,
  template text not null,
  updated_at timestamptz not null default now()
);
