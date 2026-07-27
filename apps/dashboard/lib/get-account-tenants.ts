import { createDbClient } from "@whatsapp-bot-platform/db";

export interface AccountTenantSummary {
  tenantId: string;
  name: string;
  status: "draft" | "live" | "suspended";
  phoneNumberId: string | null;
  publishedAt: string | null;
}

/**
 * Server-side only — goes through the service-role createDbClient(), NOT a
 * browser Supabase client, since no RLS policies exist yet (see
 * lib/supabase/client.ts's comment). `accountId` must come from an already-
 * verified session (supabase.auth.getUser() in a Server Component/Route
 * Handler) — this function trusts whatever id it's given, same as every
 * other server-role-backed function in this codebase.
 */
export async function getAccountTenants(accountId: string): Promise<AccountTenantSummary[]> {
  const db = createDbClient();
  const { data, error } = await db.from("account_tenants").select("tenant_id, tenants(id, name, status, phone_number_id, published_at)").eq("account_id", accountId);

  if (error) throw new Error(`getAccountTenants: ${error.message}`);

  return (data ?? [])
    .map((row) => row.tenants)
    .filter((tenant): tenant is NonNullable<typeof tenant> => tenant !== null)
    .map((tenant) => ({
      tenantId: tenant.id,
      name: tenant.name,
      status: tenant.status as AccountTenantSummary["status"],
      phoneNumberId: tenant.phone_number_id,
      publishedAt: tenant.published_at,
    }));
}
