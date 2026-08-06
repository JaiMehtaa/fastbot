"use server";

import { revalidatePath } from "next/cache";
import { createDbClient } from "@whatsapp-bot-platform/db";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { getAccountTenants } from "../../../../lib/get-account-tenants";

export async function setNotificationStatusAction(
  tenantId: string,
  notificationId: string,
  status: "unread" | "read" | "resolved",
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  const accountTenants = await getAccountTenants(user.id);
  if (!accountTenants.some((tenant) => tenant.tenantId === tenantId)) {
    return { error: "You don't have access to this bot." };
  }

  const db = createDbClient();
  // Scoped by tenant_id, not just id — a notification id belonging to a
  // DIFFERENT tenant this account doesn't own can never be touched here,
  // even if somehow guessed.
  const { error } = await db.from("dashboard_notifications").update({ status }).eq("id", notificationId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/${tenantId}/inbox`);
  return {};
}
