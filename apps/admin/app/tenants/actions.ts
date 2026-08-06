"use server";

import { revalidatePath } from "next/cache";
import { createDbClient } from "@whatsapp-bot-platform/db";

/**
 * The only lever available for pricing today — tenants.pricing_tier has no
 * billing system behind it (no subscriptions/invoices table exists at all),
 * so this is a manual admin override, not a real billing flow. Bridges "no
 * billing exists yet" with "I still need to know who's on what plan."
 */
export async function setPricingTierAction(tenantId: string, pricingTier: string): Promise<{ error?: string }> {
  const db = createDbClient();
  const { error } = await db.from("tenants").update({ pricing_tier: pricingTier }).eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/tenants");
  return {};
}
