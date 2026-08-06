import Link from "next/link";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { getAccountTenants } from "../../lib/get-account-tenants";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  live: "Live",
  suspended: "Suspended",
};

export default async function DashboardOverviewPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tenants = await getAccountTenants(user!.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Your bots</h1>

      {tenants.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
          No bot connected yet. Finish building one and connect a WhatsApp number to see it here.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tenants.map((tenant) => (
            <li key={tenant.tenantId} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{tenant.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    tenant.status === "live" ? "bg-emerald-900 text-emerald-300" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {STATUS_LABEL[tenant.status] ?? tenant.status}
                </span>
              </div>
              {tenant.phoneNumberId && <p className="mt-1 text-xs text-neutral-500">Number: {tenant.phoneNumberId}</p>}
              <div className="mt-2 flex gap-3">
                <Link href={`/dashboard/${tenant.tenantId}/edit`} className="text-xs text-emerald-400 underline">
                  Edit
                </Link>
                <Link href={`/dashboard/${tenant.tenantId}/inbox`} className="text-xs text-emerald-400 underline">
                  Inbox
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link href="/dashboard/connect" className="w-fit rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white">
        Connect a WhatsApp number
      </Link>
    </div>
  );
}
