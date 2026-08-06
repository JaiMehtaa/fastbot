import { AdminNav } from "../admin-nav";
import { getAllNotifications } from "../../lib/get-all-notifications";
import type { AdminNotification } from "../../lib/get-all-notifications";
import { NotificationStatusSelect } from "./status-select";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  escalation: "Escalation 🎧",
  lead: "Lead 📝",
  delivery_failure: "Delivery failure",
  config_validation_warning: "Config warning",
};

export default async function AdminNotificationsPage() {
  let notifications: AdminNotification[] | undefined;
  let loadError: string | null = null;
  try {
    notifications = await getAllNotifications();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load notifications.";
  }

  const unreadCount = notifications?.filter((n) => n.status === "unread").length ?? 0;

  return (
    <div className="min-h-screen">
      <AdminNav current="/notifications" />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Every escalation and lead across every tenant, newest first — {unreadCount} unread. This is the only place
          in the product today that surfaces these across more than one tenant at a time.
        </p>

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">{loadError}</div>
        )}

        {notifications && notifications.length === 0 && (
          <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
            Nothing yet.
          </div>
        )}

        {notifications && notifications.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {notifications.map((notification) => (
              <div key={notification.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{TYPE_LABEL[notification.type] ?? notification.type}</span>
                      <span className="text-neutral-500">·</span>
                      <span className="text-neutral-400">{notification.tenantName}</span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-300">{notification.ticketSummary ?? "(no ticket content found)"}</p>
                    {notification.ticketWaId && <p className="mt-1 text-xs text-neutral-500">From: {notification.ticketWaId}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <NotificationStatusSelect notificationId={notification.id} status={notification.status} />
                    <span className="text-[11px] text-neutral-600">{new Date(notification.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
