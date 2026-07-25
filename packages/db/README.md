# packages/db — Supabase/Postgres Client, Types, Migrations

Shared server-side database access layer — `apps/interview-api`, `apps/runtime`, and `apps/admin` all go through `createDbClient()` here rather than each creating their own Supabase client.

- **`supabase/migrations/20260101000000_core_schema.sql`** — every table from `/docs/architecture.md`'s Data Model, with RLS enabled and no policies yet (safe-by-default until it's known which tables need direct client-side access), plus explicit `service_role` grants (RLS and table-level grants are checked separately — `service_role` needs both). Deliberately excludes `primitive_registry`/`lob_recipes` — those stay code-authored in `packages/schema` for the MVP. Lives under `supabase/migrations/` (not a standalone `migrations/` dir) so the Supabase CLI's own tooling (`supabase db reset`, `db push`, `migration list`) can apply it directly, locally or against a real project — no separate copy to keep in sync.
- **`src/client.ts`** — `createDbClient()`, the one shared entry point. Fails loudly at construction (not on first query) if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are missing.
- **`src/generated-types.ts`** — real output of `supabase gen types typescript --local`, generated against a live local Supabase stack (`supabase start` from this directory, Docker required). Regenerate the same way after any schema change — do not hand-edit.

Uses the service-role key, not the anon key: this is server-side access that's meant to bypass RLS, not work around it.

## Local development

```
supabase start   # boots Postgres + PostgREST + Auth etc. in Docker, applies every migration
supabase db reset  # re-applies migrations from scratch (drops local data)
supabase gen types typescript --local > src/generated-types.ts   # after any schema change
supabase stop
```

`supabase start` prints a local `SERVICE_ROLE_KEY` and `API_URL` (`http://127.0.0.1:54321`) — set those as `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` to point `createDbClient()` at the local stack.
