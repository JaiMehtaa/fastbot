import { createDbClient } from "@whatsapp-bot-platform/db";

export interface AdminTenantSummary {
  tenantId: string;
  name: string;
  status: string;
  phoneNumberId: string | null;
  pricingTier: string;
  ownerEmail: string | null;
  createdAt: string;
  publishedAt: string | null;
}

/**
 * The cross-tenant view apps/dashboard's own getAccountTenants() can't
 * provide (that one is scoped to a single signed-in account by design).
 * auth.users isn't queryable through the normal postgrest `.from()` — it's
 * a separate schema — so owner email is resolved via the Admin API
 * (db.auth.admin.listUsers(), available because createDbClient() always
 * uses the service-role key) and joined in application code against
 * account_tenants.account_id.
 */
export async function getAllTenants(): Promise<AdminTenantSummary[]> {
  const db = createDbClient();

  const { data: tenants, error: tenantsError } = await db
    .from("tenants")
    .select("id, name, status, phone_number_id, pricing_tier, created_at, published_at")
    .order("created_at", { ascending: false });
  if (tenantsError) throw new Error(`getAllTenants: ${tenantsError.message}`);

  const { data: owners, error: ownersError } = await db.from("account_tenants").select("account_id, tenant_id").eq("role", "owner");
  if (ownersError) throw new Error(`getAllTenants (account_tenants): ${ownersError.message}`);

  const { data: usersPage, error: usersError } = await db.auth.admin.listUsers({ perPage: 200 });
  if (usersError) throw new Error(`getAllTenants (auth.users): ${usersError.message}`);
  const emailByAccountId = new Map(usersPage.users.map((u) => [u.id, u.email ?? null]));
  const ownerAccountIdByTenantId = new Map((owners ?? []).map((o) => [o.tenant_id, o.account_id]));

  return (tenants ?? []).map((tenant) => {
    const ownerAccountId = ownerAccountIdByTenantId.get(tenant.id);
    return {
      tenantId: tenant.id,
      name: tenant.name,
      status: tenant.status,
      phoneNumberId: tenant.phone_number_id,
      pricingTier: tenant.pricing_tier,
      ownerEmail: ownerAccountId ? (emailByAccountId.get(ownerAccountId) ?? ownerAccountId) : null,
      createdAt: tenant.created_at,
      publishedAt: tenant.published_at,
    };
  });
}
