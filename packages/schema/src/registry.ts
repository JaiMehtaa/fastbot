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

export interface RegistryConsistencyIssue {
  message: string;
}

/**
 * Checks that no two primitives in the given set (the live registry by
 * default) declare the same state name. `apps/runtime`'s compile step relies
 * on state names being globally unique across whatever primitives a tenant
 * selects — two primitives sharing a name would silently overwrite each
 * other's state-table entry. This is the static, whole-registry version of
 * that guarantee; `packages/compiler`'s `assignStateTableEntry` is the
 * runtime backstop for the same invariant.
 */
export function checkRegistryConsistency(
  schemas: readonly PrimitiveSchema[] = listPrimitives(),
): RegistryConsistencyIssue[] {
  const issues: RegistryConsistencyIssue[] = [];
  const ownerByState = new Map<string, PrimitiveKey>();

  for (const schema of schemas) {
    for (const state of schema.stateContract) {
      const owner = ownerByState.get(state);
      if (owner && owner !== schema.key) {
        issues.push({
          message: `State "${state}" is declared by both "${owner}" and "${schema.key}" — state names must be unique across the entire primitive registry.`,
        });
      } else {
        ownerByState.set(state, schema.key);
      }
    }
  }

  return issues;
}
