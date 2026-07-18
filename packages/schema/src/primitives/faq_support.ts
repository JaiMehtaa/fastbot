import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";

export const faqSupportPrimitive: PrimitiveSchema = {
  key: "faq_support",
  schemaVersion: 1,
  label: "FAQ & Support",
  entryLabel: "FAQs ❓",
  requiredFields: [
    {
      key: "faqs",
      label: "Frequently asked questions",
      type: "array",
      required: true,
      minItems: 1,
      interviewHint:
        "What are the questions customers ask you most often, and how do you usually answer them?",
      itemFields: [
        {
          key: "question",
          label: "Question",
          type: "string",
          required: true,
          interviewHint: "What's the question?",
        },
        {
          key: "answer",
          label: "Answer",
          type: "text",
          required: true,
          interviewHint: "What's the answer you'd want the bot to give?",
        },
      ],
    },
  ],
  optionalFields: [
    {
      key: "fallback_message",
      label: "Fallback message",
      type: "text",
      required: false,
      interviewHint:
        "If a customer asks something outside your FAQ list, what should the bot say before offering to connect them to a person?",
    },
  ],
  rendererContract:
    "Renders an interactive list of question titles; tapping one answers directly. Free-text questions that don't match an FAQ closely fall through to the bounded LLM fallback (or fallback_message if LLM fallback is disabled), then offer human_escalation.",
  stateContract: ["FAQ_MENU", "FAQ_ANSWER", "FAQ_FALLBACK"],
};
