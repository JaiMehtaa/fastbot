"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, SESSION_COOKIE_NAME } from "../../lib/session";

export interface LoginActionResult {
  error?: string;
}

export async function loginAction(_prev: LoginActionResult, formData: FormData): Promise<LoginActionResult> {
  const password = String(formData.get("password") ?? "");

  let valid: boolean;
  try {
    valid = await checkPassword(password);
  } catch {
    return { error: "Admin login isn't configured (ADMIN_PASSWORD is not set)." };
  }
  if (!valid) return { error: "Incorrect password." };

  const token = await createSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
