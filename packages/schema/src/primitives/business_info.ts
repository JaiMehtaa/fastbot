import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";

export const businessInfoPrimitive: PrimitiveSchema = {
  key: "business_info",
  schemaVersion: 1,
  label: "Business Info",
  entryLabel: "About Us ℹ️",
  requiredFields: [
    {
      key: "business_name",
      label: "Business name",
      type: "string",
      required: true,
      interviewHint: "What's the name of your business?",
      example: "Zap Home Care",
    },
    {
      key: "description",
      label: "Short description",
      type: "text",
      required: true,
      interviewHint: "In a sentence or two, what does your business do or sell?",
      example: "We make dishwash and laundry care products.",
    },
    {
      key: "hours",
      label: "Operating hours",
      type: "weekly_hours",
      required: true,
      interviewHint: "What are your business hours? (e.g. Mon-Sat 9am-7pm, closed Sundays)",
      example: { mon_fri: "9:00-19:00", sat: "9:00-17:00", sun: "closed" },
    },
  ],
  optionalFields: [
    {
      key: "location",
      label: "Location / address",
      type: "string",
      required: false,
      interviewHint: "Do you have a physical location customers should know about?",
    },
    {
      key: "contact_phone",
      label: "Contact phone",
      type: "phone",
      required: false,
      interviewHint: "Is there a phone number customers can call, separate from this WhatsApp number?",
    },
    {
      key: "contact_email",
      label: "Contact email",
      type: "string",
      required: false,
      interviewHint: "Do you have a support/contact email to share?",
    },
    {
      key: "website",
      label: "Website",
      type: "url",
      required: false,
      interviewHint: "Do you have a website you'd like to link?",
    },
  ],
  rendererContract:
    "Renders a single interactive button card ('About Us') showing business_name, description, hours, and any optional contact fields present. No sub-navigation beyond Back / Main Menu.",
  stateContract: ["BUSINESS_INFO_VIEW"],
};
