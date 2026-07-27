import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server
 * Actions) — reads the session from cookies so `.auth.getUser()` tells you
 * who's logged in. Same "Auth only, not data access" scoping as
 * lib/supabase/client.ts — see that file's comment for why.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component, not a Server Action/Route Handler —
          // middleware.ts is what actually refreshes the session in that case
        }
      },
    },
  });
}
