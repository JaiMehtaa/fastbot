import { createDbClient } from "@whatsapp-bot-platform/db";

export interface TenantNotification {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  ticketSummary: string | null;
  ticketWaId: string | null;
}

/**
 * The merchant-facing counterpart to apps/admin's cross-tenant notifications
 * view — scoped to a single tenant instead of every tenant. Same
 * dashboard_notifications -> support_tickets join (ref_id has no DB-level
 * FK, resolved in application code); this is the first place in the
 * product a merchant can see a lead or escalation without checking their
 * own WhatsApp app by hand.
 */
export async function getTenantNotifications(tenantId: string): Promise<TenantNotification[]> {
  const db = createDbClient();

  const { data: notifications, error: notifError } = await db
    .from("dashboard_notifications")
    .select("id, type, ref_id, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (notifError) throw new Error(`getTenantNotifications: ${notifError.message}`);

  const ticketIds = (notifications ?? []).map((n) => n.ref_id);
  const { data: tickets, error: ticketsError } =
    ticketIds.length > 0
      ? await db.from("support_tickets").select("id, summary, wa_id").in("id", ticketIds)
      : { data: [], error: null };
  if (ticketsError) throw new Error(`getTenantNotifications (support_tickets): ${ticketsError.message}`);
  const ticketById = new Map((tickets ?? []).map((t) => [t.id, t]));

  return (notifications ?? []).map((notification) => {
    const ticket = ticketById.get(notification.ref_id);
    return {
      id: notification.id,
      type: notification.type,
      status: notification.status,
      createdAt: notification.created_at,
      ticketSummary: ticket?.summary ?? null,
      ticketWaId: ticket?.wa_id ?? null,
    };
  });
}
