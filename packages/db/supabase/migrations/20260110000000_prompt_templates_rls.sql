-- prompt_templates was the only table (of 13) missing this — every other
-- migration enables RLS on its new table, this one was skipped. Harmless in
-- practice today (only service_role has any grants), but closing the gap
-- for consistency, found live during an admin-dashboard schema review.
alter table prompt_templates enable row level security;
