import { createDbClient } from "@whatsapp-bot-platform/db";
import { listPromptTemplates, PROMPT_REGISTRY, type PromptKey } from "@whatsapp-bot-platform/prompt-config";
import { AdminNav } from "./admin-nav";
import { PromptEditor } from "./prompts/prompt-editor";

// Must render per-request, not once at build time: this page shows live DB
// state (edits made through PromptEditor's server actions, which call
// revalidatePath("/") expecting a fresh render) and SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY aren't even available at build time.
export const dynamic = "force-dynamic";

const DEFAULTS = Object.fromEntries(Object.entries(PROMPT_REGISTRY).map(([key, entry]) => [key, entry.default]));

export default async function AdminHomePage() {
  let summaries;
  let loadError: string | null = null;
  try {
    const db = createDbClient();
    summaries = await listPromptTemplates(db, DEFAULTS);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load prompt templates.";
  }

  return (
    <div className="min-h-screen">
      <AdminNav current="/" />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Prompt management</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Edit the instructions behind every LLM call site in the interview and the live WhatsApp bot. Changes take
          effect within about 30 seconds — no deploy needed.
        </p>

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
            {loadError}
          </div>
        )}

        {summaries && (
          <div className="mt-8 flex flex-col gap-6">
            {summaries.map((summary) => (
              <PromptEditor
                key={summary.key}
                summary={summary}
                label={PROMPT_REGISTRY[summary.key as PromptKey]?.label ?? summary.key}
                description={PROMPT_REGISTRY[summary.key as PromptKey]?.description ?? ""}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
