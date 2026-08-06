import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { getAccountTenants } from "../../../../lib/get-account-tenants";
import { getTenantNotifications } from "../../../../lib/get-tenant-notifications";
import { NotificationStatusSelect } from "./status-select";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  escalation: "Escalation 🎧",
  lead: "Lead 📝",
  delivery_failure: "Delivery failure",
  config_validation_warning: "Config warning",
};

export default async function TenantInboxPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountTenants = await getAccountTenants(user.id);
  const tenant = accountTenants.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Bot not found</h1>
        <p className="text-sm text-neutral-400">You don&apos;t have access to this bot, or it doesn&apos;t exist.</p>
        <Link href="/dashboard" className="w-fit text-sm text-emerald-400 underline">
          ← Back to your bots
        </Link>
      </div>
    );
  }

  let notifications;
  let loadError: string | null = null;
  try {
    notifications = await getTenantNotifications(tenantId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load your inbox.";
  }

  const unreadCount = notifications?.filter((n) => n.status === "unread").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← Your bots
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{tenant.name} — Inbox</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Every time a customer asked for a human, or left their details — {unreadCount} unread.
        </p>
      </div>

      {loadError && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">{loadError}</div>}

      {notifications && notifications.length === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
          Nothing yet — this fills in as customers message your bot and ask for help or leave their details.
        </div>
      )}

      {notifications && notifications.length > 0 && (
        <div className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <div key={notification.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-sm font-medium">{TYPE_LABEL[notification.type] ?? notification.type}</span>
                  <p className="mt-1 text-sm text-neutral-300">{notification.ticketSummary ?? "(no details recorded)"}</p>
                  {notification.ticketWaId && <p className="mt-1 text-xs text-neutral-500">From: {notification.ticketWaId}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <NotificationStatusSelect tenantId={tenantId} notificationId={notification.id} status={notification.status} />
                  <span className="text-[11px] text-neutral-600">{new Date(notification.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
