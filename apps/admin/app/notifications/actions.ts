"use server";

import { revalidatePath } from "next/cache";
import { createDbClient } from "@whatsapp-bot-platform/db";

export async function setNotificationStatusAction(
  notificationId: string,
  status: "unread" | "read" | "resolved",
): Promise<{ error?: string }> {
  const db = createDbClient();
  const { error } = await db.from("dashboard_notifications").update({ status }).eq("id", notificationId);
  if (error) return { error: error.message };
  revalidatePath("/notifications");
  return {};
}
