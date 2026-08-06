import { createDbClient } from "@whatsapp-bot-platform/db";

export interface AdminNotification {
  id: string;
  tenantId: string;
  tenantName: string;
  type: string;
  status: string;
  createdAt: string;
  ticketSummary: string | null;
  ticketWaId: string | null;
}

/**
 * The one cross-tenant view of everything the runtime has ever flagged as
 * needing a human — escalations and leads — that has no read-side UI
 * anywhere else in the product yet (apps/dashboard's per-tenant equivalent
 * is a separate, later build). dashboard_notifications.ref_id is a
 * polymorphic pointer with no DB-level FK (by design, per the schema); in
 * practice every notification type actually created today (escalation,
 * lead) points at a support_tickets row, so that's what's joined here —
 * a notification whose ref_id doesn't resolve just shows no ticket content
 * rather than failing the whole page.
 */
export async function getAllNotifications(): Promise<AdminNotification[]> {
  const db = createDbClient();

  const { data: notifications, error: notifError } = await db
    .from("dashboard_notifications")
    .select("id, tenant_id, type, ref_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (notifError) throw new Error(`getAllNotifications: ${notifError.message}`);

  const { data: tenants, error: tenantsError } = await db.from("tenants").select("id, name");
  if (tenantsError) throw new Error(`getAllNotifications (tenants): ${tenantsError.message}`);
  const tenantNameById = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  const ticketIds = (notifications ?? []).map((n) => n.ref_id);
  const { data: tickets, error: ticketsError } =
    ticketIds.length > 0
      ? await db.from("support_tickets").select("id, summary, wa_id").in("id", ticketIds)
      : { data: [], error: null };
  if (ticketsError) throw new Error(`getAllNotifications (support_tickets): ${ticketsError.message}`);
  const ticketById = new Map((tickets ?? []).map((t) => [t.id, t]));

  return (notifications ?? []).map((notification) => {
    const ticket = ticketById.get(notification.ref_id);
    return {
      id: notification.id,
      tenantId: notification.tenant_id,
      tenantName: tenantNameById.get(notification.tenant_id) ?? "Unknown tenant",
      type: notification.type,
      status: notification.status,
      createdAt: notification.created_at,
      ticketSummary: ticket?.summary ?? null,
      ticketWaId: ticket?.wa_id ?? null,
    };
  });
}
