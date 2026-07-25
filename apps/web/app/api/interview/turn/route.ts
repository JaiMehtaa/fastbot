import { NextResponse } from "next/server";

const INTERVIEW_API_URL = process.env.INTERVIEW_API_URL ?? "http://localhost:3001";

/**
 * Thin server-side proxy to apps/interview-api's real /interview/turn route
 * (apps/interview-api/src/server.ts) — keeps that service's URL out of the
 * browser bundle and sidesteps CORS entirely, same reasoning as the
 * /api/interview/sandbox proxy below it.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const response = await fetch(`${INTERVIEW_API_URL}/interview/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
