import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";

export interface CuratedScenario {
  key: string;
  description: string;
  /** a real, valid DraftConfig — must pass packages/compiler's validateDraft (enforced by scenarios.test.ts) */
  groundTruth: DraftConfig;
  /** hand-authored messy material — no LLM involved, a deterministic fixture */
  material: string;
  /** what the interview agent / packages/eval gating is expected to do when it hits this material */
  expectedBehavior: string;
}

/** All curated scenarios below share this recipe — only draftSessionId and fieldValues actually vary. */
function retailD2cGroundTruth(draftSessionId: string, fieldValues: DraftConfig["fieldValues"]): DraftConfig {
  return {
    draftSessionId,
    version: 1,
    lobKey: "retail_d2c",
    selectedPrimitives: ["business_info", "catalogue", "faq_support", "human_escalation"],
    fieldValues,
  };
}

/**
 * Curated, hand-designed adversarial cases — a deliberate complement to the
 * larger LLM-generated regression suite (see docs/architecture.md "Synthetic
 * Data Bootstrap"). These specifically stress-test packages/eval's
 * confidence-gating logic, not just the interview's happy path, and they run
 * on every CI commit since they involve no LLM call to author.
 */
export const curatedScenarios: readonly CuratedScenario[] = [
  {
    key: "ambiguous_lob",
    description:
      "A business description that could plausibly read as either retail or a service business — should trigger exactly one clarifying question before a LOB is settled on.",
    groundTruth: retailD2cGroundTruth("scenario-ambiguous-lob", {
      business_info: {
        business_name: "Glow Studio",
        description: "We sell skincare products and also do in-person facials.",
        hours: { mon_fri: "10:00-19:00", sat: "10:00-17:00", sun: "closed" },
      },
      catalogue: {
        items: [{ name: "Glow Serum", link: "https://glowstudio.example/serum" }],
      },
      faq_support: {
        faqs: [{ question: "Do you ship pan-India?", answer: "Yes, across India." }],
      },
      human_escalation: {
        escalation_prompt: "Someone from our team will reach out shortly.",
      },
    }),
    material: "We sell stuff and also help people out sometimes, kind of a mix of things really.",
    expectedBehavior:
      "LOB classification self-reported confidence should fall below threshold; exactly one clarifying question is asked; falls back to minimal_support if still ambiguous after that.",
  },
  {
    key: "contradictory_hours",
    description: "Business owner states hours, then contradicts themselves mid-conversation.",
    groundTruth: retailD2cGroundTruth("scenario-contradictory-hours", {
      business_info: {
        business_name: "Zap Home Care",
        description: "We make dishwash and laundry care products.",
        hours: { mon_sat: "9:00-19:00", sun: "closed" },
      },
      catalogue: {
        items: [{ name: "ShineZap Dishwash Bar", link: "https://amazon.in/dp/xyz" }],
      },
      faq_support: {
        faqs: [{ question: "Do you ship pan-India?", answer: "Yes, across India." }],
      },
      human_escalation: {
        escalation_prompt: "I'll get someone from our team to reach out shortly.",
      },
    }),
    material: "We're open 9 to 7 every day... actually wait, sorry, we're closed on Sundays.",
    expectedBehavior:
      "The committed value for business_info.hours should reflect the correction (closed Sundays), not the first, superseded statement.",
  },
  {
    key: "vague_catalogue_item",
    description:
      "Business owner mentions a product with no way to buy it — should surface as a missing required sub-field, not a silently incomplete catalogue item.",
    groundTruth: retailD2cGroundTruth("scenario-vague-catalogue-item", {
      business_info: {
        business_name: "Meadow Soaps",
        description: "Handmade natural soaps.",
        hours: { mon_fri: "9:00-18:00", sat: "closed", sun: "closed" },
      },
      catalogue: {
        items: [{ name: "Lavender Oatmeal Bar", link: "https://meadowsoaps.example/lavender" }],
      },
      faq_support: {
        faqs: [{ question: "Are your soaps vegan?", answer: "Yes, all of them." }],
      },
      human_escalation: {
        escalation_prompt: "Someone will get back to you soon.",
      },
    }),
    material: "We sell handmade soap, really nice stuff, lavender and oatmeal scents.",
    expectedBehavior:
      "catalogue.items[0].link is not derivable from the material alone — the interview should ask for a store/product link before accepting the item as complete, per the field's `required: true` in packages/schema.",
  },
  {
    key: "booking_without_stated_hours",
    description:
      "A salon that clearly wants appointment booking but never states operating hours — booking's cross-primitive dependency on business_info.hours (packages/compiler's validateDraft) should surface as a specific missing field, not get silently skipped or conflated with a generic prompt.",
    groundTruth: {
      draftSessionId: "scenario-booking-without-hours",
      version: 1,
      lobKey: "salon_spa",
      selectedPrimitives: ["business_info", "booking", "human_escalation"],
      fieldValues: {
        business_info: {
          business_name: "Glow Hair Studio",
          description: "A neighborhood hair salon offering cuts, color, and styling by appointment.",
          hours: { mon_sat: "10:00-19:00", sun: "closed" },
        },
        booking: {
          services: [
            { name: "Haircut", durationMinutes: 45, price: 600 },
            { name: "Color & Style", durationMinutes: 120, price: 2500 },
          ],
          slotGranularityMinutes: 30,
          bookingWindowDays: 14,
        },
        human_escalation: {
          escalation_prompt: "We'll get back to you shortly to sort that out.",
        },
      },
    },
    material:
      "People can book a haircut or color appointment with us, takes about 45 minutes for a cut or a couple hours for color. We don't really have a website or anything, they just message us.",
    expectedBehavior:
      "booking should be selected from 'book/appointment' language; business_info.hours is never mentioned in the material and must still be asked for explicitly — the interview cannot let booking be marked complete without it.",
  },
  {
    key: "lead_capture_no_catalogue",
    description:
      "A consultancy that only wants to capture interested visitors' contact details, not sell a product list — classification should select lead_capture without dragging in catalogue or faq_support just because 'consultancy'/'design' language is present.",
    groundTruth: {
      draftSessionId: "scenario-lead-capture-no-catalogue",
      version: 1,
      lobKey: "custom",
      selectedPrimitives: ["business_info", "lead_capture", "human_escalation"],
      fieldValues: {
        business_info: {
          business_name: "Vertex Interior Consultants",
          description: "We design and plan home interiors for apartments and villas.",
          hours: { mon_fri: "10:00-18:00", sat: "10:00-14:00", sun: "closed" },
        },
        lead_capture: {
          capture_prompt: "Leave your name, phone number, and a bit about your space, and our design team will reach out.",
        },
        human_escalation: {
          escalation_prompt: "We'll connect you with a designer shortly.",
        },
      },
    },
    material:
      "We're an interior design consultancy — we don't sell products directly, we just want people who are interested to leave their number so our design team can call them back.",
    expectedBehavior:
      "lead_capture should be selected from 'leave their number'/'call them back' language; catalogue and faq_support should NOT be selected just because the material mentions 'design' and 'services' — there's no product list or FAQ content here, only a callback request.",
  },
];
