import type { PrimitiveKey, PrimitiveSchema } from "@whatsapp-bot-platform/shared-types";
import { businessInfoPrimitive } from "./primitives/business_info.js";
import { cataloguePrimitive } from "./primitives/catalogue.js";
import { faqSupportPrimitive } from "./primitives/faq_support.js";
import { humanEscalationPrimitive } from "./primitives/human_escalation.js";

/**
 * Every primitive added here is automatically what apps/admin's registry view
 * and apps/interview-api's field extraction see — there is no separate
 * manual "wire it up" step, by construction.
 */
export const primitiveRegistry: Partial<Record<PrimitiveKey, PrimitiveSchema>> = {
  business_info: businessInfoPrimitive,
  catalogue: cataloguePrimitive,
  faq_support: faqSupportPrimitive,
  human_escalation: humanEscalationPrimitive,
};

export function getPrimitive(key: PrimitiveKey): PrimitiveSchema {
  const schema = primitiveRegistry[key];
  if (!schema) {
    throw new Error(`Unknown or not-yet-implemented primitive: ${key}`);
  }
  return schema;
}

export function listPrimitives(): readonly PrimitiveSchema[] {
  return Object.values(primitiveRegistry).filter((s): s is PrimitiveSchema => Boolean(s));
}
