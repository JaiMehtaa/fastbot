import { NextResponse } from "next/server";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:3002";

/**
 * Thin server-side proxy to apps/runtime's POST /preview/message — same
 * reasoning as the other proxy routes in this app (keeps the runtime URL
 * out of the browser bundle, sidesteps CORS).
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const response = await fetch(`${RUNTIME_API_URL}/preview/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
