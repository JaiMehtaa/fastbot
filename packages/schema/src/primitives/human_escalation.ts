import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";

export const humanEscalationPrimitive: PrimitiveSchema = {
  key: "human_escalation",
  schemaVersion: 1,
  label: "Human Escalation",
  entryLabel: "Talk to Us 🎧",
  requiredFields: [
    {
      key: "escalation_prompt",
      label: "Escalation offer message",
      type: "text",
      required: true,
      interviewHint:
        "When a customer wants to talk to a real person, what should the bot say before creating a ticket for your team?",
      example: "I'll get someone from our team to reach out to you shortly.",
    },
  ],
  optionalFields: [
    {
      key: "notify_email",
      label: "Notification email",
      type: "string",
      required: false,
      interviewHint: "Where should we notify you when a customer needs a human? (this also always shows up in your dashboard)",
    },
    {
      key: "business_hours_only",
      label: "Business hours only",
      type: "boolean",
      required: false,
      interviewHint: "Should escalation only be offered during your business_info hours?",
    },
  ],
  rendererContract:
    "On trigger (explicit menu tap, or FAQ fallback with no match), shows escalation_prompt as a button card, creates a support_ticket + dashboard_notification on confirmation, and holds conversation state until a human resolves the ticket.",
  stateContract: ["ESCALATION_CONFIRM", "ESCALATION_ACTIVE"],
};
