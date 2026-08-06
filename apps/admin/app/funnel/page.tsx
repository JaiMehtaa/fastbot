import { AdminNav } from "../admin-nav";
import { getFunnelStats } from "../../lib/get-funnel-stats";

export const dynamic = "force-dynamic";

const DRAFT_STATUS_ORDER = ["in_progress", "testing", "promoted", "abandoned", "expired"];
const BINDING_STATUS_ORDER = ["pending", "bound", "expired"];

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-neutral-900 py-2 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono font-medium">{value.toLocaleString()}</span>
    </div>
  );
}

export default async function AdminFunnelPage() {
  let stats;
  let loadError: string | null = null;
  try {
    stats = await getFunnelStats();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load funnel stats.";
  }

  return (
    <div className="min-h-screen">
      <AdminNav current="/funnel" />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Funnel</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Every anonymous interview started, whether it reached WhatsApp sandbox testing, and how it compares to live
          conversation volume — all read directly from the same tables the product writes to, no separate analytics
          pipeline.
        </p>

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">{loadError}</div>
        )}

        {stats && (
          <div className="mt-8 flex flex-col gap-6">
            <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="font-medium">Interview sessions (draft_sessions.status)</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Every prospect who opened the website interview, guest or signed-up, at whatever stage they left it.
              </p>
              <div className="mt-3">
                {DRAFT_STATUS_ORDER.map((status) => (
                  <StatRow key={status} label={status} value={stats.draftSessionsByStatus[status] ?? 0} />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="font-medium">Sandbox WhatsApp joins (draft_wa_bindings.status)</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Of those, how many actually tested their bot on real WhatsApp before ever signing up.
              </p>
              <div className="mt-3">
                {BINDING_STATUS_ORDER.map((status) => (
                  <StatRow key={status} label={status} value={stats.sandboxBindingsByStatus[status] ?? 0} />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="font-medium">Guest vs. live conversation volume</h2>
              <p className="mt-1 text-xs text-neutral-500">
                chat_history.context_type — the cleanest guest/live split in the schema. "Guest" is every message sent
                during an anonymous interview or sandbox test; "live" is real, connected-number traffic.
              </p>
              <div className="mt-3">
                <StatRow label="Distinct guest conversations" value={stats.distinctConversations.draft} />
                <StatRow label="Distinct live conversations" value={stats.distinctConversations.tenant} />
                <StatRow label="Total guest messages" value={stats.totalMessages.draft} />
                <StatRow label="Total live messages" value={stats.totalMessages.tenant} />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
