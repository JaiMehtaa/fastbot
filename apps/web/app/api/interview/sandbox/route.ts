import { NextResponse } from "next/server";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:3002";

/**
 * Thin server-side proxy to apps/runtime's real POST /sandbox/issue route
 * (apps/runtime/src/server.ts, wrapping issueSandboxBinding()) — keeps that
 * service's URL out of the browser bundle and sidesteps CORS entirely.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const response = await fetch(`${RUNTIME_API_URL}/sandbox/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
