import { MAIN_MENU_BUTTON, buildButtonMessage, buildListMessage } from "../whatsapp-payload.js";
import { parseIndexedReplyId, type HandlerInput, type HandlerOutput } from "./types.js";

interface CatalogueItem {
  name: string;
  link: string;
  description?: string;
  price?: number;
  featured?: boolean;
}

const ITEM_PREFIX = "catalogue_item_";
const BACK_TO_LIST_ID = "back_to_catalogue_list";

function renderList(waId: string, items: readonly CatalogueItem[]): HandlerOutput {
  const withIndex = items.map((item, index) => ({ item, index }));
  const sorted = [...withIndex].sort(
    (a, b) => Number(Boolean(b.item.featured)) - Number(Boolean(a.item.featured)),
  );

  return {
    nextState: "CATALOGUE_LIST",
    outboundPayload: buildListMessage(
      waId,
      "Browse Products 🛍️",
      "Choose an item to view details.",
      "Tap an item to see more",
      "View Products",
      sorted.map(({ item, index }) => ({
        id: `${ITEM_PREFIX}${index}`,
        title: item.featured ? `⭐ ${item.name}` : item.name,
        description: item.description,
      })),
    ),
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
    const lines = [item.description, item.price !== undefined ? `Price: ${item.price}` : "", `🔗 ${item.link}`].filter(
      Boolean,
    );
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
