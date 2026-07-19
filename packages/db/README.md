# packages/db — Supabase/Postgres Client, Types, Migrations

Shared server-side database access layer — `apps/interview-api`, `apps/runtime`, and `apps/admin` all go through `createDbClient()` here rather than each creating their own Supabase client.

- **`migrations/0001_core_schema.sql`** — every table from `/docs/architecture.md`'s Data Model, with RLS enabled and no policies yet (safe-by-default until it's known which tables need direct client-side access). Deliberately excludes `primitive_registry`/`lob_recipes` — those stay code-authored in `packages/schema` for the MVP.
- **`src/client.ts`** — `createDbClient()`, the one shared entry point. Fails loudly at construction (not on first query) if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are missing — no Supabase project exists yet, so this is wired but not live-tested, same pattern as `packages/eval`'s OpenRouter client.
- **`src/generated-types.ts`** — a hand-written placeholder matching `supabase gen types typescript`'s output shape, kept in sync with the migration by hand. Replace this whole file with the real CLI output once a Supabase project exists — don't keep both.

Uses the service-role key, not the anon key: this is server-side access that's meant to bypass RLS, not work around it.
