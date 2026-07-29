"use client";

import { useState } from "react";

interface ListRow {
  id: string;
  title: string;
  description?: string;
}

interface OutboundMessage {
  type: "interactive";
  interactive:
    | { type: "list"; header?: { text: string }; body: { text: string }; footer?: { text: string }; action: { button: string; sections: { title: string; rows: ListRow[] }[] } }
    | { type: "button"; header?: { text: string }; body: { text: string }; action: { buttons: { type: "reply"; reply: { id: string; title: string } }[] } };
}

interface ChatEntry {
  direction: "inbound" | "outbound";
  message: OutboundMessage;
}

const DEMO_WA_ID = "919999999999";

export function WhatsappPreview() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [started, setStarted] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(message: { type: "text"; text: string } | { type: "interactive"; interactiveReplyId: string }): Promise<void> {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/preview/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          message: { waId: DEMO_WA_ID, messageId: `preview-${crypto.randomUUID()}`, receivedAt: new Date().toISOString(), ...message },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "That number isn't connected to a live bot yet.");
        return;
      }
      setEntries((prev) => [...prev, ...data.sentMessages.map((m: OutboundMessage) => ({ direction: "outbound" as const, message: m }))]);
    } finally {
      setSending(false);
    }
  }

  async function startChat(): Promise<void> {
    if (!phoneNumberId.trim()) return;
    setStarted(true);
    await send({ type: "text", text: "hi" });
  }

  function handleTap(rowOrButtonId: string, title: string): void {
    setEntries((prev) => [
      ...prev,
      { direction: "inbound", message: { type: "interactive", interactive: { type: "button", body: { text: title }, action: { buttons: [] } } } },
    ]);
    void send({ type: "interactive", interactiveReplyId: rowOrButtonId });
  }

  function handleSubmitText(event: React.FormEvent): void {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setEntries((prev) => [
      ...prev,
      { direction: "inbound", message: { type: "interactive", interactive: { type: "button", body: { text }, action: { buttons: [] } } } },
    ]);
    setInput("");
    void send({ type: "text", text });
  }

  if (!started) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
        <p className="text-sm text-neutral-400">
          Enter the WhatsApp phone number ID of a live bot (the one you used on the dashboard's connect page) to simulate a customer
          chatting with it.
        </p>
        <input
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="e.g. 948385815035482"
          className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          onClick={() => void startChat()}
          disabled={!phoneNumberId.trim()}
          className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Start chat
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-neutral-800 shadow-xl">
      <div className="bg-[#005e54] px-4 py-3 text-white">
        <p className="text-sm font-medium">Business Bot</p>
        <p className="text-xs text-emerald-100/80">via WhatsApp</p>
      </div>
      <div className="flex flex-col gap-2 bg-[#e5ddd5] p-3" style={{ minHeight: 420 }}>
        {entries.map((entry, index) => (
          <Bubble key={index} entry={entry} onTap={handleTap} />
        ))}
        {sending && <div className="self-start rounded-lg bg-white px-3 py-2 text-xs text-neutral-500 shadow">…</div>}
      </div>
      {error && <p className="bg-[#e5ddd5] px-3 pb-2 text-xs text-red-600">{error}</p>}
      <form onSubmit={handleSubmitText} className="flex gap-2 border-t border-neutral-800 bg-neutral-900 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
          className="flex-1 rounded-full border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-white outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <button type="submit" disabled={sending || !input.trim()} className="rounded-full bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          ➤
        </button>
      </form>
    </div>
  );
}

function Bubble({ entry, onTap }: { entry: ChatEntry; onTap: (id: string, title: string) => void }) {
  const isInbound = entry.direction === "inbound";
  const i = entry.message.interactive;

  return (
    <div className={`flex flex-col gap-1 ${isInbound ? "items-end" : "items-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow ${isInbound ? "bg-[#dcf8c6] text-neutral-900" : "bg-white text-neutral-900"}`}>
        {i.header?.text && <p className="mb-1 font-semibold">{i.header.text}</p>}
        <p className="whitespace-pre-wrap">{i.body.text}</p>
        {i.type === "list" && i.footer?.text && <p className="mt-1 text-xs text-neutral-500">{i.footer.text}</p>}
      </div>

      {!isInbound && i.type === "list" && (
        <div className="flex max-w-[85%] flex-col gap-1 rounded-lg bg-white p-1 shadow">
          {i.action.sections.flatMap((section) => section.rows).map((row) => (
            <button
              key={row.id}
              onClick={() => onTap(row.id, row.title)}
              className="rounded px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
            >
              {row.title}
              {row.description && <span className="block text-xs text-neutral-500">{row.description}</span>}
            </button>
          ))}
        </div>
      )}

      {!isInbound && i.type === "button" && i.action.buttons.length > 0 && (
        <div className="flex max-w-[85%] flex-col gap-1 rounded-lg bg-white p-1 shadow">
          {i.action.buttons.map((b) => (
            <button
              key={b.reply.id}
              onClick={() => onTap(b.reply.id, b.reply.title)}
              className="rounded px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
            >
              {b.reply.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
