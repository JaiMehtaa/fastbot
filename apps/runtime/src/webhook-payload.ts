import type { ChatHistoryStatus, InboundMessage } from "@whatsapp-bot-platform/shared-types";

interface MetaWebhookMessage {
  from: string;
  id: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

interface MetaWebhookStatus {
  id: string;
  status: string;
}

interface MetaWebhookValue {
  metadata?: { phone_number_id?: string };
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
  contacts?: { profile?: { name?: string } }[];
}

export interface MetaWebhookBody {
  entry?: { changes?: { value?: MetaWebhookValue }[] }[];
}

export interface ParsedWebhookMessage {
  kind: "message";
  phoneNumberId: string;
  message: InboundMessage;
  contactName?: string;
}

export interface ParsedWebhookStatus {
  kind: "status";
  phoneNumberId: string;
  messageId: string;
  status: ChatHistoryStatus;
}

export type ParsedWebhookEvent = ParsedWebhookMessage | ParsedWebhookStatus | { kind: "ignored" };

/** Meta's delivery-status webhook uses "sent"/"delivered"/"read"/"failed" — a direct
 * subset of ChatHistoryStatus; anything unrecognized falls back to "sent" rather than
 * being dropped, since a status update always implies at least that much happened. */
const KNOWN_STATUS_VALUES: readonly ChatHistoryStatus[] = ["sent", "delivered", "read", "failed"];

function normalizeStatus(raw: string): ChatHistoryStatus {
  return (KNOWN_STATUS_VALUES as readonly string[]).includes(raw) ? (raw as ChatHistoryStatus) : "sent";
}

const KNOWN_MESSAGE_TYPES: readonly InboundMessage["type"][] = [
  "text",
  "interactive",
  "image",
  "video",
  "document",
  "audio",
  "sticker",
];

/** Matches the raw webhook shape the Pittie reference workflow's "Set Message Context" / "Extract Status Data" nodes consume. */
export function parseWebhookPayload(body: MetaWebhookBody): ParsedWebhookEvent {
  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return { kind: "ignored" };

  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return { kind: "ignored" };

  const status = value.statuses?.[0];
  if (status) {
    return { kind: "status", phoneNumberId, messageId: status.id, status: normalizeStatus(status.status) };
  }

  const raw = value.messages?.[0];
  if (!raw) return { kind: "ignored" };

  const interactiveReplyId = raw.interactive?.button_reply?.id ?? raw.interactive?.list_reply?.id;
  const text = raw.text?.body ?? raw.interactive?.button_reply?.title ?? raw.interactive?.list_reply?.title;
  const type = KNOWN_MESSAGE_TYPES.includes(raw.type as InboundMessage["type"])
    ? (raw.type as InboundMessage["type"])
    : "text";
  const receivedAt = new Date((Number(raw.timestamp) || Date.now() / 1000) * 1000).toISOString();

  const message: InboundMessage = {
    waId: raw.from,
    messageId: raw.id,
    type,
    text,
    interactiveReplyId,
    receivedAt,
  };

  return { kind: "message", phoneNumberId, message, contactName: value.contacts?.[0]?.profile?.name };
}
