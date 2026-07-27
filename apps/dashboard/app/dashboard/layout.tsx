import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { signOutAction } from "../auth/actions";

/**
 * The one place "is this user logged in" gets checked for the whole
 * customer dashboard — every page under app/dashboard/* is protected by
 * virtue of being nested under this layout, rather than each page
 * re-checking auth itself.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <span className="font-semibold">WhatsApp Bot Platform</span>
        <div className="flex items-center gap-4 text-sm text-neutral-400">
          <span>{user.email}</span>
          <form action={signOutAction}>
            <button type="submit" className="text-neutral-400 underline hover:text-neutral-200">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
