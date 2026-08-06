"use client";

import { useState, useTransition } from "react";
import type { PromptTemplateSummary } from "@whatsapp-bot-platform/prompt-config";
import { resetPromptAction, savePromptAction } from "./actions";

export function PromptEditor({
  summary,
  label,
  description,
}: {
  summary: PromptTemplateSummary;
  label: string;
  description: string;
}) {
  const [value, setValue] = useState(summary.effectiveTemplate);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const dirty = value !== summary.effectiveTemplate;

  function handleSave() {
    startTransition(async () => {
      await savePromptAction(summary.key, value);
      setJustSaved(true);
    });
  }

  function handleReset() {
    startTransition(async () => {
      await resetPromptAction(summary.key);
      setValue(summary.defaultTemplate);
      setJustSaved(true);
    });
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">{label}</h2>
        {summary.isOverridden ? (
          <span className="shrink-0 rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-300">customized</span>
        ) : (
          <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">default</span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">{description}</p>
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setJustSaved(false);
        }}
        rows={4}
        placeholder={summary.defaultTemplate ? undefined : "Optional — leave blank for no extra guidance"}
        className="mt-3 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm outline-none focus:border-emerald-500"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={handleReset}
          disabled={isPending || (!summary.isOverridden && !dirty)}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 disabled:opacity-40"
        >
          Reset to default
        </button>
        {justSaved && !isPending && !dirty && <span className="text-xs text-neutral-500">Saved</span>}
      </div>
    </div>
  );
}
