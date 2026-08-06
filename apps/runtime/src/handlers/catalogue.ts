import { MAIN_MENU_BUTTON, buildButtonMessage, buildListMessage } from "../whatsapp-payload.js";
import { parseIndexedReplyId, type HandlerInput, type HandlerOutput } from "./types.js";

interface CatalogueItem {
  name: string;
  link: string;
  description?: string;
  price?: number;
  featured?: boolean;
  image_url?: string;
}

const ITEM_PREFIX = "catalogue_item_";
const BACK_TO_LIST_ID = "back_to_catalogue_list";
// Reserves one of WhatsApp's 10-row list cap for the always-present "Main
// Menu" row below — a real customer who opens "Browse Products" and wants
// none of the items had no way back except picking one anyway (a list
// message's single button only opens the list; it can't carry a second,
// separate "main menu" button the way a button-type message can).
const MAX_CATALOGUE_ITEMS = 9;

function renderList(waId: string, items: readonly CatalogueItem[]): HandlerOutput {
  const withIndex = items.map((item, index) => ({ item, index }));
  const sorted = [...withIndex].sort(
    (a, b) => Number(Boolean(b.item.featured)) - Number(Boolean(a.item.featured)),
  );

  const rows = sorted.slice(0, MAX_CATALOGUE_ITEMS).map(({ item, index }) => ({
    id: `${ITEM_PREFIX}${index}`,
    title: item.featured ? `⭐ ${item.name}` : item.name,
    description: item.description,
  }));
  rows.push({ id: "nav_main_menu", title: "↩️ Main Menu", description: undefined });

  return {
    nextState: "CATALOGUE_LIST",
    outboundPayload: buildListMessage(waId, "Browse Products 🛍️", "Choose an item to view details.", "Tap an item to see more", "View Products", rows),
  };
}

export async function catalogueHandler(input: HandlerInput): Promise<HandlerOutput> {
  const replyId = input.message.interactiveReplyId;
  const items = (input.stateEntry.handlerArgs.items as CatalogueItem[] | undefined) ?? [];

  if (replyId === "nav_main_menu") {
    return { nextState: "ROOT" };
  }

  const itemIndex = parseIndexedReplyId(replyId, ITEM_PREFIX);
  const item = itemIndex !== null ? items[itemIndex] : undefined;
  if (item) {
    const lines = [
      item.description,
      item.price !== undefined ? `Price: ${item.price}` : "",
      item.image_url ? `🖼️ ${item.image_url}` : "",
      `🔗 ${item.link}`,
    ].filter(Boolean);
    return {
      nextState: "CATALOGUE_ITEM_DETAIL",
      outboundPayload: buildButtonMessage(input.waId, item.name, lines.join("\n"), [
        { id: BACK_TO_LIST_ID, title: "Back to List ↩️" },
        MAIN_MENU_BUTTON,
      ]),
    };
  }

  // default: initial entry into catalogue, "back to list", or any unrecognized reply
  return renderList(input.waId, items);
}
