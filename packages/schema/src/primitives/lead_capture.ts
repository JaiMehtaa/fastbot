import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";

export const leadCapturePrimitive: PrimitiveSchema = {
  key: "lead_capture",
  schemaVersion: 1,
  label: "Lead Capture",
  entryLabel: "Get in Touch 📝",
  requiredFields: [
    {
      key: "capture_prompt",
      label: "Lead capture message",
      type: "text",
      required: true,
      interviewHint:
        "When a customer wants you to reach out to them, what should the bot ask for? (e.g. \"Share your name, phone number, and what you're interested in, and we'll get back to you.\")",
      example: "Leave your name, phone number, and what you're looking for, and we'll get back to you shortly.",
    },
  ],
  optionalFields: [
    {
      key: "notify_email",
      label: "Notification email",
      type: "string",
      required: false,
      interviewHint: "Where should we notify you when a new lead comes in? (this also always shows up in your dashboard)",
    },
  ],
  rendererContract:
    "Shows capture_prompt as a button card and awaits a single free-text reply with the customer's details — no " +
    "server-side scratch memory needed since it's one message, not a multi-field wizard. On reply, creates a " +
    "support_ticket (the customer's own message, so your team sees exactly what they wrote) plus a 'lead' " +
    "dashboard_notification, then confirms to the customer.",
  stateContract: ["LEAD_CAPTURE_START", "LEAD_CAPTURE_CONFIRM"],
};
