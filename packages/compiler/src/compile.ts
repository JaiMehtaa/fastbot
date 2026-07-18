import { getPrimitive } from "@whatsapp-bot-platform/schema";
import type {
  CompiledConfig,
  DraftConfig,
  MenuEntry,
  PrimitiveKey,
  StateTableEntry,
} from "@whatsapp-bot-platform/shared-types";
import { validateDraft } from "./validate.js";

/**
 * Assigns a state into the compiled state table, throwing if a different
 * primitive already claimed that state name. Without this guard, two
 * primitives sharing a state name would silently overwrite each other in
 * `stateTable` — the registry-level `checkRegistryConsistency` check (see
 * packages/schema) is the first line of defense, but this is the second:
 * it fails loudly at compile time even if that check was ever skipped.
 */
export function assignStateTableEntry(
  stateTable: Record<string, StateTableEntry>,
  state: string,
  primitiveKey: PrimitiveKey,
  handlerArgs: Record<string, unknown>,
): void {
  const existing = stateTable[state];
  if (existing && existing.primitiveKey !== primitiveKey) {
    throw new Error(
      `State "${state}" is claimed by both "${existing.primitiveKey}" and "${primitiveKey}" — ` +
        `primitives must not share state names.`,
    );
  }
  stateTable[state] = { primitiveKey, handlerArgs };
}

/**
 * Compiles a draft config into a CompiledConfig: a generated root-menu spec
 * plus a state table mapping each primitive's states to a generic handler
 * dispatch. This is the direct generalization of a hand-authored, per-tenant
 * state router — generated from config, never hand-authored per tenant.
 *
 * `sourceId` is the draftSessionId while sandbox-testing, or the tenantId
 * once promoted to a live tenant.
 */
export function compile(draftConfig: DraftConfig, sourceId: string = draftConfig.draftSessionId): CompiledConfig {
  const validation = validateDraft(draftConfig);
  if (!validation.valid) {
    const errorCount = validation.issues.filter((issue) => issue.severity === "error").length;
    throw new Error(
      `Cannot compile an invalid draft config (source "${sourceId}"): ` +
        `${validation.missingRequiredFields.length} missing required field(s), ${errorCount} error(s).`,
    );
  }

  const businessInfoValues = draftConfig.fieldValues.business_info ?? {};
  const businessName =
    typeof businessInfoValues.business_name === "string" ? businessInfoValues.business_name : "our business";
  const description = typeof businessInfoValues.description === "string" ? businessInfoValues.description : "";

  const entries: MenuEntry[] = [];
  const stateTable: Record<string, StateTableEntry> = {};

  for (const primitiveKey of draftConfig.selectedPrimitives) {
    const schema = getPrimitive(primitiveKey);
    const handlerArgs = draftConfig.fieldValues[primitiveKey] ?? {};
    const [entryState] = schema.stateContract;

    if (entryState) {
      entries.push({
        id: `root_${primitiveKey}`,
        label: schema.entryLabel,
        targetState: entryState,
      });
    }

    for (const state of schema.stateContract) {
      assignStateTableEntry(stateTable, state, primitiveKey, handlerArgs);
    }
  }

  return {
    sourceId,
    version: draftConfig.version,
    compiledAt: new Date().toISOString(),
    rootMenu: {
      headerText: `Welcome to ${businessName}! 🏢`,
      bodyText: description || "How can we help you today?",
      entries,
    },
    stateTable,
  };
}
