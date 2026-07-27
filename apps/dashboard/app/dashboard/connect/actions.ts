"use server";

import { redirect } from "next/navigation";
import { createDbClient } from "@whatsapp-bot-platform/db";
import { PromotionError, createDbRepository, promoteDraftToTenant } from "@whatsapp-bot-platform/runtime";
import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { getDraftConfig } from "../../../lib/get-draft-config";

export interface ConnectActionResult {
  error?: string;
}

/**
 * Promotes a completed draft to a live tenant and links it to the logged-in
 * account. `phoneNumberId` is what 360dialog's own onboarding assigns once
 * you've connected a real WhatsApp Business number through their dashboard
 * — this form doesn't provision a number itself (that's a real account
 * relationship with 360dialog + Meta business verification, not something
 * fakeable here), it's where you paste the id they gave you.
 */
export async function connectNumberAction(_prev: ConnectActionResult, formData: FormData): Promise<ConnectActionResult> {
  const draftSessionId = String(formData.get("draftSessionId") ?? "");
  const phoneNumberId = String(formData.get("phoneNumberId") ?? "").trim();

  if (!draftSessionId || !phoneNumberId) {
    return { error: "draftSessionId and phoneNumberId are both required." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in." };
  }

  const draft = await getDraftConfig(draftSessionId);
  if (!draft) {
    return { error: `No completed draft found for "${draftSessionId}".` };
  }

  const db = createDbClient();
  let tenantId: string;
  try {
    const result = await promoteDraftToTenant(draft, phoneNumberId, createDbRepository(db));
    tenantId = result.tenantId;
  } catch (error) {
    if (error instanceof PromotionError) return { error: error.message };
    throw error;
  }

  const { error: linkError } = await db.from("account_tenants").insert({ account_id: user.id, tenant_id: tenantId, role: "owner" });
  if (linkError) return { error: `Tenant created but couldn't link it to your account: ${linkError.message}` };

  redirect("/dashboard");
}
