export const SESSION_COOKIE_NAME = "admin_session";

/**
 * Simple shared-password auth: one ADMIN_PASSWORD env var, no user table,
 * no signup — deliberately the fast/minimal option for a solo-operator
 * tool today (see the plan this was scoped against). The session cookie's
 * value is an HMAC of a fixed string keyed by the password itself, so it's
 * never the raw password, needs no separate session secret or server-side
 * session storage, and stays valid until the password changes. Uses
 * Web Crypto (available in both the Node and Edge runtimes) rather than
 * node:crypto so this works unmodified from middleware.ts.
 */
async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class AdminAuthError extends Error {}

function requirePassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new AdminAuthError("ADMIN_PASSWORD is not set — admin login cannot work without it.");
  }
  return password;
}

export async function createSessionToken(): Promise<string> {
  return hmac(requirePassword(), "admin-session");
}

export async function checkPassword(candidate: string): Promise<boolean> {
  return candidate === requirePassword();
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    return token === (await createSessionToken());
  } catch {
    return false;
  }
}
