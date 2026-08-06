import type { PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";

const serviceItemFields = [
  {
    key: "name",
    label: "Service name",
    type: "string" as const,
    required: true,
    interviewHint: "What's this service called?",
    example: "Haircut",
  },
  {
    key: "durationMinutes",
    label: "Duration (minutes)",
    type: "number" as const,
    required: true,
    interviewHint: "How long does this usually take, in minutes?",
    example: 30,
  },
  {
    key: "price",
    label: "Price",
    type: "number" as const,
    required: false,
    interviewHint: "What does this service cost?",
  },
];

export const bookingPrimitive: PrimitiveSchema = {
  key: "booking",
  schemaVersion: 1,
  label: "Appointment Booking",
  entryLabel: "Book an Appointment 📅",
  requiredFields: [
    {
      key: "services",
      label: "Services",
      type: "array",
      required: true,
      minItems: 1,
      interviewHint: "What services can customers book, and how long does each one take?",
      itemFields: serviceItemFields,
    },
    {
      key: "slotGranularityMinutes",
      label: "Booking increment (minutes)",
      type: "number",
      required: true,
      interviewHint: "In what increments can customers book — e.g. every 30 minutes, every hour?",
      example: 30,
    },
    {
      key: "bookingWindowDays",
      label: "Booking window (days)",
      type: "number",
      required: true,
      interviewHint: "How many days ahead should customers be able to book?",
      example: 14,
    },
  ],
  optionalFields: [
    {
      key: "providers",
      label: "Providers / staff",
      type: "array",
      required: false,
      interviewHint: "Do specific staff members handle bookings (e.g. named stylists), or is this just \"the business\"?",
      itemFields: [
        {
          key: "name",
          label: "Provider name",
          type: "string",
          required: true,
          interviewHint: "What's this person's name?",
        },
      ],
    },
  ],
  rendererContract:
    "Renders a 4-step booking wizard entirely through interactive list/button messages, with no server-side " +
    "scratch memory — each step's selection is encoded directly into the next step's reply ids (service index, " +
    "provider index, day offset, slot index), so every state stays a pure function of its inputs like every " +
    "other primitive's handler. Availability is generated from business_info.hours (not duplicated here — see " +
    "packages/compiler's validateDraft cross-primitive check and compile()'s businessHours merge for booking's " +
    "handlerArgs) plus slotGranularityMinutes, filtered against already-held/confirmed bookings read from " +
    "apps/runtime's repository at the one step that genuinely needs a live read (selecting a time). Picking a " +
    "time places a short-lived hold (self-contained, no external calendar); confirming flips it to a real " +
    "booking; an expired, never-confirmed hold is simply treated as free again, no cleanup job required.",
  stateContract: ["BOOKING_SELECT_SERVICE", "BOOKING_SELECT_PROVIDER", "BOOKING_SELECT_DATE", "BOOKING_SELECT_TIME", "BOOKING_CONFIRM"],
};
