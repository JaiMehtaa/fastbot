"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase/server";

export interface AuthActionResult {
  error?: string;
}

export async function signUpAction(_prev: AuthActionResult, formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const draftSessionId = formData.get("draftSessionId");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  redirect(draftSessionId ? `/dashboard/connect?draftSessionId=${draftSessionId}` : "/dashboard");
}

export async function signInAction(_prev: AuthActionResult, formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const draftSessionId = formData.get("draftSessionId");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(draftSessionId ? `/dashboard/connect?draftSessionId=${draftSessionId}` : "/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
