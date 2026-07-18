import type { LobRecipe } from "@whatsapp-bot-platform/shared-types";

export const lobRecipes: readonly LobRecipe[] = [
  {
    key: "retail_d2c",
    label: "Retail / D2C",
    defaultPrimitives: ["business_info", "catalogue", "faq_support", "human_escalation"],
    classificationExamples: [
      "I sell handmade soaps and skincare products online",
      "We're a D2C clothing brand, sell through our website and Instagram",
      "I run a small FMCG brand — dishwash, laundry, home care products, sold on Amazon and Zepto",
      "We sell puja/religious items through our store and marketplaces",
    ],
  },
  {
    key: "minimal_support",
    label: "General / Unclassified",
    defaultPrimitives: ["business_info", "faq_support", "human_escalation"],
    classificationExamples: [],
  },
];

export function findLobRecipe(key: string): LobRecipe | undefined {
  return lobRecipes.find((recipe) => recipe.key === key);
}

export const FALLBACK_LOB_KEY = "minimal_support";
