/**
 * The single source of truth for "which prompts exist and what do they
 * default to" — every llm-*.ts call site (apps/interview-api,
 * apps/runtime) imports its own entry from here instead of declaring its
 * default locally, and apps/admin reads the whole map to render a
 * complete prompt-management UI without depending on either app directly
 * (apps only depend on packages in this monorepo, never on each other).
 */
export const PROMPT_REGISTRY = {
  question_phraser: {
    label: "Chat / Question Phrasing",
    description:
      "Controls how the interview's static question text gets rephrased into natural conversation — the " +
      "core of \"don't ask static questions.\" Fully free-form; there's no structured output to protect here.",
    default:
      "You are a friendly assistant helping a small business owner set up a WhatsApp bot through a short " +
      "conversational interview. Rephrase the following message naturally and warmly, in 1-2 short sentences, " +
      "as if you're chatting, not filling out a form. Do NOT change its meaning, do NOT ask about anything it " +
      "doesn't already ask about, do NOT add extra questions on top of it, and do NOT use markdown.",
  },
  capability_classifier: {
    label: "Capability Classifier",
    description:
      "Controls what the interview decides to ask about — which capabilities (catalogue, FAQs, booking, ...) " +
      "it detects from a business description. The candidate list and required JSON output format are always " +
      "appended after this and can't be changed here — editing them would break parsing.",
    default:
      "A business owner just described their business and what they want their WhatsApp bot to do. Decide " +
      "which of these capabilities apply, by key.",
  },
  field_extractor: {
    label: "Field Extractor",
    description:
      "Controls how the interview reads structured answers out of free-text replies. The field-by-field " +
      "spec and required JSON output format are always appended after this and can't be changed here.",
    default:
      "A business owner is being interviewed to set up a WhatsApp bot. Extract answers to any of the " +
      "following fields that their latest message actually addresses — a single message can answer more than " +
      "one field at once. Do NOT include a field in your response if the message doesn't address it; do NOT " +
      "guess or invent a value.",
  },
  owner_info_extractor: {
    label: "Owner Info Extractor",
    description:
      "Controls how the interview reads the business owner's own name/contact from their reply. The " +
      "field-by-field spec and required JSON output format are always appended after this.",
    default:
      "A person setting up a WhatsApp bot for their business just told you their own name and/or how to " +
      "reach them (a phone number or email, separate from the WhatsApp number itself).",
  },
  faq_fallback_guidance: {
    label: "FAQ Fallback Tone",
    description:
      "Optional tone/style guidance for the live WhatsApp bot's free-text FAQ answers (e.g. \"keep answers " +
      "under two sentences\"). This is the highest-stakes prompt in the system — it answers real customers " +
      "live on WhatsApp. The rule that answers may ONLY use what's in the tenant's own FAQ list, and must say " +
      "so rather than invent facts otherwise, is hardcoded and always applied after this guidance — it cannot " +
      "be removed or overridden here.",
    default: "",
  },
} as const;

export type PromptKey = keyof typeof PROMPT_REGISTRY;
