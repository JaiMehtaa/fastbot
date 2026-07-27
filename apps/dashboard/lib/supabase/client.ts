import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client — used only for Auth (signIn/signUp/signOut,
 * session cookies via @supabase/ssr's standard pattern). Real business data
 * (tenants, account_tenants) is deliberately NOT queried from here — no RLS
 * policies exist yet (packages/db/supabase/migrations' own comment: "safe-by-
 * default until it's known which tables a client actually needs direct
 * Supabase-client access to"). Data access stays server-side through
 * @whatsapp-bot-platform/db's service-role createDbClient(), manually scoped
 * to the verified session's user id — the same DI/service-role pattern
 * apps/interview-api and apps/runtime already use, not a new one.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
