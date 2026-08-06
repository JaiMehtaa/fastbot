import { AdminNav } from "../admin-nav";
import { getAllTenants } from "../../lib/get-all-tenants";
import type { AdminTenantSummary } from "../../lib/get-all-tenants";
import { PricingTierSelect } from "./pricing-tier-select";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  live: "Live",
  suspended: "Suspended",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-neutral-800 text-neutral-400",
  live: "bg-emerald-900 text-emerald-300",
  suspended: "bg-red-900 text-red-300",
};

export default async function AdminTenantsPage() {
  let tenants: AdminTenantSummary[] | undefined;
  let loadError: string | null = null;
  try {
    tenants = await getAllTenants();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load tenants.";
  }

  return (
    <div className="min-h-screen">
      <AdminNav current="/tenants" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-xl font-semibold">Tenants</h1>
        <p className="mt-1 text-sm text-neutral-400">Every bot across every account — {tenants?.length ?? 0} total.</p>

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">{loadError}</div>
        )}

        {tenants && tenants.length === 0 && (
          <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
            No tenants yet.
          </div>
        )}

        {tenants && tenants.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Owner</th>
                  <th className="py-2 pr-4">Number connected</th>
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.tenantId} className="border-b border-neutral-900">
                    <td className="py-3 pr-4 font-medium">{tenant.name}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[tenant.status] ?? "bg-neutral-800 text-neutral-400"}`}>
                        {STATUS_LABEL[tenant.status] ?? tenant.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-neutral-400">{tenant.ownerEmail ?? "—"}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-neutral-400">{tenant.phoneNumberId ?? "not connected"}</td>
                    <td className="py-3 pr-4">
                      <PricingTierSelect tenantId={tenant.tenantId} pricingTier={tenant.pricingTier} />
                    </td>
                    <td className="py-3 pr-4 text-neutral-500">{new Date(tenant.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
