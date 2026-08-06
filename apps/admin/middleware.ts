import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "./lib/session";

/**
 * The one place "is this an authenticated admin" gets checked for the
 * whole app — every route is protected by default, /login is the one
 * explicit exception (same "gate everything, carve out the login path"
 * shape as apps/dashboard's Supabase-Auth middleware, just with a shared
 * password instead of a user table).
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/api/health")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await isValidSessionToken(token)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
