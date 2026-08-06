import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrimitive } from "@whatsapp-bot-platform/schema";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { getAccountTenants } from "../../../../lib/get-account-tenants";
import { getTenantEditorData } from "../../../../lib/get-tenant-editor-data";
import { TenantEditor } from "./tenant-editor";

export default async function TenantEditPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountTenants = await getAccountTenants(user.id);
  if (!accountTenants.some((tenant) => tenant.tenantId === tenantId)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Bot not found</h1>
        <p className="text-sm text-neutral-400">You don&apos;t have access to this bot, or it doesn&apos;t exist.</p>
        <Link href="/dashboard" className="w-fit text-sm text-emerald-400 underline">
          ← Back to your bots
        </Link>
      </div>
    );
  }

  const data = await getTenantEditorData(tenantId);
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Can&apos;t edit this bot yet</h1>
        <p className="text-sm text-neutral-400">
          This bot doesn&apos;t have an editable configuration on record (it may predate the editor). Contact support to get it
          migrated.
        </p>
        <Link href="/dashboard" className="w-fit text-sm text-emerald-400 underline">
          ← Back to your bots
        </Link>
      </div>
    );
  }

  const primitives = data.draftConfig.selectedPrimitives.map((key) => getPrimitive(key));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← Your bots
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Edit {data.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">Changes go live immediately once saved.</p>
      </div>
      <TenantEditor tenantId={tenantId} primitives={primitives} initialFieldValues={data.draftConfig.fieldValues} />
    </div>
  );
}
