import type { RootMenu } from "@whatsapp-bot-platform/shared-types";

/** WhatsApp's hard cap on interactive list rows per message. */
const MAX_LIST_ROWS = 10;

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
      header: { type: "text", text: header },
      body: { text: body },
      footer: { text: footer },
      action: { button: buttonLabel, sections: [{ title: buttonLabel, rows: rows.slice(0, MAX_LIST_ROWS) }] },
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
      header: { type: "text", text: header },
      body: { text: body },
      action: { buttons: buttons.map((reply) => ({ type: "reply" as const, reply })) },
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
