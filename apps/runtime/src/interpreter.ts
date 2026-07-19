import type { CompiledConfig, InboundMessage } from "@whatsapp-bot-platform/shared-types";
import { businessInfoHandler } from "./handlers/business-info.js";
import { catalogueHandler } from "./handlers/catalogue.js";
import { createFaqSupportHandler, type FaqFallbackFn } from "./handlers/faq-support.js";
import { humanEscalationHandler } from "./handlers/human-escalation.js";
import type { HandlerOutput, PrimitiveHandler } from "./handlers/types.js";
import { buildRootMenuMessage } from "./whatsapp-payload.js";

const MAX_HANDOFF_HOPS = 5;

/**
 * The generic interpreter (docs/architecture.md, "Runtime Engine Design",
 * point 6) — one dispatch table shared by every tenant, parameterized
 * entirely by that tenant's compiled_config. This is the direct
 * generalization of the Pittie reference workflow's hardcoded, per-brand
 * Brand Logic Engine: no per-tenant bespoke code, ever.
 *
 * A handler may return a `nextState` with no `outboundPayload` as a handoff
 * to whichever primitive owns that state (e.g. faq_support's low-confidence
 * fallback handing off to human_escalation) — the interpreter chases that
 * chain generically rather than any handler special-casing another
 * primitive's behavior.
 */
export function createInterpreter(faqFallback: FaqFallbackFn) {
  const handlersByPrimitive: Partial<Record<string, PrimitiveHandler>> = {
    business_info: businessInfoHandler,
    catalogue: catalogueHandler,
    faq_support: createFaqSupportHandler(faqFallback),
    human_escalation: humanEscalationHandler,
  };

  async function dispatch(
    compiledConfig: CompiledConfig,
    state: string,
    waId: string,
    message: InboundMessage,
  ): Promise<HandlerOutput> {
    const stateEntry = compiledConfig.stateTable[state];
    if (!stateEntry) {
      // stale/unknown state (e.g. a tenant's config changed underneath an in-flight
      // conversation) — fail safe back to the root menu rather than erroring out
      return { nextState: "ROOT", outboundPayload: buildRootMenuMessage(waId, compiledConfig.rootMenu) };
    }

    const handler = handlersByPrimitive[stateEntry.primitiveKey];
    if (!handler) {
      throw new Error(`No handler registered for primitive "${stateEntry.primitiveKey}"`);
    }

    return handler({ waId, currentState: state, message, stateEntry });
  }

  return async function interpret(
    compiledConfig: CompiledConfig,
    currentState: string,
    waId: string,
    message: InboundMessage,
  ): Promise<HandlerOutput> {
    let targetState = currentState;

    if (currentState === "ROOT") {
      const replyId = message.interactiveReplyId;
      const entry = replyId ? compiledConfig.rootMenu.entries.find((e) => e.id === replyId) : undefined;
      if (!entry) {
        return { nextState: "ROOT", outboundPayload: buildRootMenuMessage(waId, compiledConfig.rootMenu) };
      }
      targetState = entry.targetState;
    }

    let result = await dispatch(compiledConfig, targetState, waId, message);
    let hops = 0;

    while (!result.outboundPayload) {
      if (result.nextState === "ROOT") {
        return { ...result, outboundPayload: buildRootMenuMessage(waId, compiledConfig.rootMenu) };
      }
      if (hops >= MAX_HANDOFF_HOPS) {
        throw new Error(`Handler handoff chain exceeded ${MAX_HANDOFF_HOPS} hops without producing an outbound payload`);
      }
      result = await dispatch(compiledConfig, result.nextState, waId, message);
      hops += 1;
    }

    return result;
  };
}
