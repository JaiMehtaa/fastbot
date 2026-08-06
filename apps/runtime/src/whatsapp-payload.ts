import type { RootMenu } from "@whatsapp-bot-platform/shared-types";

/** WhatsApp's hard cap on interactive list rows per message. */
const MAX_LIST_ROWS = 10;

/**
 * WhatsApp Cloud API's real, documented length limits on interactive
 * message fields — found live via QA testing that nothing anywhere in the
 * compile/render path enforced these (a long FAQ question or catalogue
 * item name/description sailed straight through and would be rejected, or
 * behave unpredictably, against the real API). Enforced centrally here
 * (every outbound payload goes through these two builders) rather than at
 * the schema/interview layer, since truncating to a hard API limit isn't a
 * product/UX decision — it's the one thing every payload must satisfy to
 * even be sendable.
 */
const LIST_ROW_TITLE_MAX = 24;
const LIST_ROW_DESCRIPTION_MAX = 72;
const LIST_BUTTON_LABEL_MAX = 20;
const SECTION_TITLE_MAX = 24;
const INTERACTIVE_HEADER_MAX = 60;
const INTERACTIVE_BODY_MAX = 1024;
const INTERACTIVE_FOOTER_MAX = 60;
const BUTTON_REPLY_TITLE_MAX = 20;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 1)}…`;
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppOutboundListMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: "list";
    header?: { type: "text"; text: string };
    body: { text: string };
    footer?: { text: string };
    action: { button: string; sections: readonly { title: string; rows: readonly WhatsAppListRow[] }[] };
  };
}

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppOutboundButtonMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: "button";
    header?: { type: "text"; text: string };
    body: { text: string };
    footer?: { text: string };
    action: { buttons: readonly { type: "reply"; reply: WhatsAppButton }[] };
  };
}

export type WhatsAppOutboundMessage = WhatsAppOutboundListMessage | WhatsAppOutboundButtonMessage;

/** Mirrors the proven message shape from the Pittie reference workflow's Send/Brand Logic nodes. */
export function buildListMessage(
  to: string,
  header: string,
  body: string,
  footer: string,
  buttonLabel: string,
  rows: readonly WhatsAppListRow[],
): WhatsAppOutboundListMessage {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: truncate(header, INTERACTIVE_HEADER_MAX) },
      body: { text: truncate(body, INTERACTIVE_BODY_MAX) },
      footer: { text: truncate(footer, INTERACTIVE_FOOTER_MAX) },
      action: {
        button: truncate(buttonLabel, LIST_BUTTON_LABEL_MAX),
        sections: [
          {
            title: truncate(buttonLabel, SECTION_TITLE_MAX),
            rows: rows.slice(0, MAX_LIST_ROWS).map((row) => ({
              id: row.id,
              title: truncate(row.title, LIST_ROW_TITLE_MAX),
              description: row.description !== undefined ? truncate(row.description, LIST_ROW_DESCRIPTION_MAX) : undefined,
            })),
          },
        ],
      },
    },
  };
}

export function buildButtonMessage(
  to: string,
  header: string,
  body: string,
  buttons: readonly WhatsAppButton[],
): WhatsAppOutboundButtonMessage {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: truncate(header, INTERACTIVE_HEADER_MAX) },
      body: { text: truncate(body, INTERACTIVE_BODY_MAX) },
      action: {
        buttons: buttons.map((reply) => ({
          type: "reply" as const,
          reply: { id: reply.id, title: truncate(reply.title, BUTTON_REPLY_TITLE_MAX) },
        })),
      },
    },
  };
}

export const MAIN_MENU_BUTTON: WhatsAppButton = { id: "nav_main_menu", title: "Main Menu 🏠" };

export function buildRootMenuMessage(to: string, rootMenu: RootMenu): WhatsAppOutboundListMessage {
  return buildListMessage(
    to,
    rootMenu.headerText,
    rootMenu.bodyText,
    "Tap below to view options",
    "Main Menu",
    rootMenu.entries.map((entry) => ({ id: entry.id, title: entry.label, description: entry.description })),
  );
}
