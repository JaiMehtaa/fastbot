"use client";

import { useActionState } from "react";
import { connectNumberAction, type ConnectActionResult } from "./actions";

const initialState: ConnectActionResult = {};

export function ConnectForm({ draftSessionId }: { draftSessionId?: string }) {
  const [state, formAction, pending] = useActionState(connectNumberAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="text-sm text-neutral-400">
        Draft session ID
        <input
          name="draftSessionId"
          defaultValue={draftSessionId}
          placeholder="the id shown when you finished building your bot"
          required
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </label>
      <label className="text-sm text-neutral-400">
        WhatsApp phone number ID
        <input
          name="phoneNumberId"
          placeholder="from your 360dialog dashboard, after connecting your number"
          required
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm outline-none focus:border-emerald-500"
        />
      </label>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Connecting…" : "Connect and go live"}
      </button>
    </form>
  );
}
