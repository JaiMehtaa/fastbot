"use client";

import { useState } from "react";
import type { DraftConfig, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";

interface ChatMessage {
  role: "assistant" | "user";
  text: string;
}

/** Mirrors apps/interview-api's InterviewSessionState — just the fields needed to build a DraftConfig. */
interface InterviewState {
  draftSessionId: string;
  lobKey: string | null;
  selectedPrimitives: readonly PrimitiveKey[];
  fieldValues: DraftConfig["fieldValues"];
}

interface TurnResponse {
  responseText: string;
  done: boolean;
  state: InterviewState;
  error?: string;
}

interface SandboxResponse {
  token: string;
  expiresAt: string;
  joinUrl: string;
  error?: string;
}

const OPENING_MESSAGE = "Hi! I'll help you set up your WhatsApp bot. First off, what's your name, and what's the best way to reach you?";

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3003";

export function InterviewChat() {
  const [draftSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: OPENING_MESSAGE }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [lastState, setLastState] = useState<InterviewState | null>(null);
  const [sandbox, setSandbox] = useState<{ status: "idle" | "loading" | "ready" | "error"; joinUrl?: string; error?: string }>({
    status: "idle",
  });

  async function sendTurn(text: string): Promise<void> {
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const response = await fetch("/api/interview/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftSessionId, text }),
      });
      const data: TurnResponse = await response.json();
      if (!response.ok) {
        setMessages((prev) => [...prev, { role: "assistant", text: `Something went wrong: ${data.error ?? "please try again."}` }]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", text: data.responseText }]);
      setDone(data.done);
      setLastState(data.state);
    } finally {
      setSending(false);
    }
  }

  async function testOnWhatsApp(): Promise<void> {
    if (!lastState) return;
    setSandbox({ status: "loading" });
    const draft: DraftConfig = {
      draftSessionId: lastState.draftSessionId,
      version: 1,
      lobKey: lastState.lobKey,
      selectedPrimitives: lastState.selectedPrimitives,
      fieldValues: lastState.fieldValues,
    };
    const response = await fetch("/api/interview/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    });
    const data: SandboxResponse = await response.json();
    if (!response.ok) {
      setSandbox({ status: "error", error: data.error ?? "Could not create a test link right now." });
      return;
    }
    setSandbox({ status: "ready", joinUrl: data.joinUrl });
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    void sendTurn(text);
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[85%] rounded-xl px-4 py-2 text-sm leading-relaxed ${
              message.role === "assistant"
                ? "self-start bg-neutral-800 text-neutral-100"
                : "self-end bg-emerald-600 text-white"
            }`}
          >
            {message.text}
          </div>
        ))}
        {sending && <div className="self-start text-sm text-neutral-500">Thinking…</div>}
      </div>

      {!done && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type your answer…"
            disabled={sending}
            className="flex-1 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}

      {done && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-emerald-700/50 bg-emerald-950/30 p-4">
          <p className="text-sm text-emerald-200">Your bot is ready. Test it on real WhatsApp before connecting a number.</p>
          {sandbox.status === "idle" && (
            <button
              onClick={() => void testOnWhatsApp()}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white"
            >
              Test on WhatsApp
            </button>
          )}
          {sandbox.status === "loading" && <p className="text-sm text-neutral-400">Creating your test link…</p>}
          {sandbox.status === "error" && <p className="text-sm text-red-400">{sandbox.error}</p>}
          {sandbox.status === "ready" && sandbox.joinUrl && (
            <a
              href={sandbox.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white"
            >
              Open WhatsApp to test your bot →
            </a>
          )}
          <a
            href={`${DASHBOARD_URL}/signup?draftSessionId=${draftSessionId}`}
            className="text-sm text-emerald-300 underline underline-offset-2"
          >
            Happy with it? Sign up to connect your real number →
          </a>
        </div>
      )}
    </div>
  );
}
