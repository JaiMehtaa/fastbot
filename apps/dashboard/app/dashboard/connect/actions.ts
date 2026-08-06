"use server";

import { redirect } from "next/navigation";
import { createDbClient } from "@whatsapp-bot-platform/db";
import { DbRepositoryError, PromotionError, createDbRepository, promoteDraftToTenant } from "@whatsapp-bot-platform/runtime";
import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { getDraftConfig } from "../../../lib/get-draft-config";

export interface ConnectActionResult {
  error?: string;
}

// draftSessionId is a UUID everywhere it's persisted — reject a malformed one
// here with a clean error rather than letting getDraftConfig's raw Postgres
// "invalid input syntax for type uuid" surface as an uncaught Next.js crash
// page (found live via QA testing; apps/interview-api/src/server.ts already
// guards its own draftSessionId input the same way).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!UUID_PATTERN.test(draftSessionId)) {
    return { error: `"${draftSessionId}" isn't a valid draft session id.` };
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
    // A real phone_number_id can only ever belong to one live tenant (tenants_phone_number_id_key) —
    // this is the expected, common case of pasting an id that's already connected elsewhere, not a
    // server malfunction, so it gets a clean, specific message rather than falling through to the
    // generic branch below and definitely not the raw Postgres error (discovered live: it was
    // reaching the browser as an uncaught Next.js runtime error, stack trace and all).
    if (error instanceof DbRepositoryError && error.message.includes("duplicate key") && error.message.includes("phone_number_id")) {
      return { error: "This WhatsApp number is already connected to another bot. Each number can only be connected once." };
    }
    if (error instanceof DbRepositoryError) return { error: `Couldn't connect this number right now: ${error.message}` };
    throw error;
  }

  const { error: linkError } = await db.from("account_tenants").insert({ account_id: user.id, tenant_id: tenantId, role: "owner" });
  if (linkError) return { error: `Tenant created but couldn't link it to your account: ${linkError.message}` };

  redirect("/dashboard");
}
