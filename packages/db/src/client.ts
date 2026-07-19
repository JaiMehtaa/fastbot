import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./generated-types.js";

export class DbClientError extends Error {}

export type DbClient = SupabaseClient<Database>;

/**
 * The one shared entry point for server-side database access — apps/interview-api,
 * apps/runtime, and apps/admin all go through this rather than each creating
 * their own Supabase client. Fails at construction time (not on first query)
 * if credentials are missing, same fail-loud pattern as packages/eval's
 * createOpenRouterClient.
 *
 * Uses the service-role key, not the anon key — this is server-side access
 * that bypasses RLS by design. Every table in migrations/0001_core_schema.sql
 * has RLS enabled with no policies yet, so an anon-key client could not do
 * anything useful here even if one were built.
 */
export function createDbClient(config: { url?: string; serviceKey?: string } = {}): DbClient {
  const url = config.url ?? process.env.SUPABASE_URL;
  const serviceKey = config.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new DbClientError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Every server-side data access " +
        "in this system goes through this one client.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
