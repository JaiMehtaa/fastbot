-- Backing store for the booking primitive (packages/schema/src/primitives/booking.ts,
-- apps/runtime/src/handlers/booking.ts). Self-contained — no external calendar — per the
-- dynamic-interview plan's locked decision. provider defaults to a sentinel rather than
-- allowing null: Postgres treats every NULL as distinct in a unique constraint, which would
-- silently defeat the double-booking guard below for the common case of a business with no
-- named staff (providers is an optional field on booking.ts).
--
-- held_until, not a background cleanup job: an expired, never-confirmed hold is simply
-- treated as free again by whatever query checks availability (status = 'confirmed' or
-- (status = 'held' and held_until > now())) — the row is just left in place.
--
-- The unique constraint is a defense-in-depth backstop against the exact-same-start-time
-- race, not a full overlap guard (a longer service starting at a different, overlapping
-- time wouldn't be caught by this alone) — the real guard is the application-level overlap
-- check in apps/runtime's repository before ever attempting the insert. Documented as a
-- known, reasonable v1 simplification rather than claimed as airtight.
create table bookings (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('draft', 'tenant')),
  context_id uuid not null,
  wa_id text not null,
  service text not null,
  provider text not null default '_default',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'held' check (status in ('held', 'confirmed', 'cancelled')),
  held_until timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (context_id, provider, starts_at)
);
create index bookings_context_idx on bookings (context_type, context_id, starts_at);
-- apps/runtime's reminder sweep (dev-start.ts's polling loop) scans across all tenants for
-- upcoming, unreminded, confirmed bookings — not scoped to one context_id like every other
-- query here, so it needs its own index rather than reusing bookings_context_idx.
create index bookings_reminder_sweep_idx on bookings (status, starts_at) where reminder_sent_at is null;
alter table bookings enable row level security;
