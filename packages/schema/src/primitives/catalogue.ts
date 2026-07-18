import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";

const itemFields = [
  {
    key: "name",
    label: "Item name",
    type: "string" as const,
    required: true,
    interviewHint: "What's this product/item called?",
  },
  {
    key: "link",
    label: "Buy link",
    type: "url" as const,
    required: true,
    interviewHint: "Where can customers view or buy this item (a store link, Amazon listing, etc.)?",
  },
  {
    key: "description",
    label: "Description",
    type: "text" as const,
    required: false,
    interviewHint: "Anything worth telling customers about this item?",
  },
  {
    key: "price",
    label: "Price",
    type: "number" as const,
    required: false,
    interviewHint: "What does this item cost?",
  },
  {
    key: "image_url",
    label: "Image URL",
    type: "url" as const,
    required: false,
    interviewHint: "Do you have a product photo URL for this item?",
  },
  {
    key: "featured",
    label: "Featured / on offer",
    type: "boolean" as const,
    required: false,
    interviewHint: "Is this item currently on offer or a best-seller you want to highlight?",
  },
];

export const cataloguePrimitive: PrimitiveSchema = {
  key: "catalogue",
  schemaVersion: 1,
  label: "Product Catalogue",
  entryLabel: "Browse Products 🛍️",
  requiredFields: [
    {
      key: "items",
      label: "Products",
      type: "array",
      required: true,
      minItems: 1,
      interviewHint:
        "What products or product lines do you want customers to be able to browse on WhatsApp?",
      itemFields,
    },
  ],
  optionalFields: [
    {
      key: "categories",
      label: "Categories",
      type: "array",
      required: false,
      interviewHint: "Do your products fall into a few categories you'd like grouped separately?",
      itemFields: [
        {
          key: "name",
          label: "Category name",
          type: "string",
          required: true,
          interviewHint: "What's this category called?",
        },
      ],
    },
  ],
  rendererContract:
    "Renders an interactive list of items (WhatsApp caps lists at 10 rows — pagination/'more' handling is a runtime concern, not a config concern). 'featured' items surface first / get a badge. Tapping an item shows its detail card with description, price, image, and the buy link as a button.",
  stateContract: ["CATALOGUE_LIST", "CATALOGUE_ITEM_DETAIL"],
};
