"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionResult } from "./actions";

const initialState: LoginActionResult = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="password"
        type="password"
        placeholder="Admin password"
        required
        autoFocus
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm outline-none focus:border-emerald-500"
      />
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
