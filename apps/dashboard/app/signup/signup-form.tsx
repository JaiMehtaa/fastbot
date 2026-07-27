"use client";

import { useActionState } from "react";
import { signUpAction, type AuthActionResult } from "../auth/actions";

const initialState: AuthActionResult = {};

export function SignupForm({ draftSessionId }: { draftSessionId?: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {draftSessionId && <input type="hidden" name="draftSessionId" value={draftSessionId} />}
      <input
        name="email"
        type="email"
        placeholder="you@business.com"
        required
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <input
        name="password"
        type="password"
        placeholder="Password (min 6 characters)"
        required
        minLength={6}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm outline-none focus:border-emerald-500"
      />
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Signing up…" : "Sign up"}
      </button>
    </form>
  );
}
