import { FALLBACK_LOB_KEY, findLobRecipe } from "@whatsapp-bot-platform/schema";
import { validateDraft } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";
import { classifyLob, type ClassifyLobFn } from "./lob-classifier.js";
import { extractFields, type ExtractFieldsFn, type FieldExtraction } from "./field-extractor.js";

export interface InterviewSessionState {
  draftSessionId: string;
  lobKey: string | null;
  /** true once we've already asked one LOB clarifying question this session */
  lobAmbiguityAsked: boolean;
  selectedPrimitives: readonly PrimitiveKey[];
  fieldValues: DraftConfig["fieldValues"];
  confirmed: boolean;
}

export function createInitialState(draftSessionId: string): InterviewSessionState {
  return {
    draftSessionId,
    lobKey: null,
    lobAmbiguityAsked: false,
    selectedPrimitives: [],
    fieldValues: {},
    confirmed: false,
  };
}

export interface InterviewDeps {
  classifyFn: ClassifyLobFn;
  extractFn: ExtractFieldsFn;
}

export interface TurnResult {
  state: InterviewSessionState;
  /**
   * A placeholder for the actual message shown to the user this turn —
   * functional (built directly from packages/schema's interview_hints and
   * field values), not a finished conversational voice. The real tone/
   * phrasing/personality of "the chatbot" is deliberately separate,
   * collaborative work (see docs/planning-log.md) — this exists so the
   * turn-handling mechanics are testable end-to-end today.
   */
  responseText: string;
  done: boolean;
}

function currentDraft(state: InterviewSessionState): DraftConfig {
  return {
    draftSessionId: state.draftSessionId,
    version: 1,
    lobKey: state.lobKey,
    selectedPrimitives: state.selectedPrimitives,
    fieldValues: state.fieldValues,
  };
}

function mergeExtractions(
  fieldValues: DraftConfig["fieldValues"],
  committed: readonly FieldExtraction[],
): DraftConfig["fieldValues"] {
  const next = { ...fieldValues };
  for (const extraction of committed) {
    next[extraction.primitiveKey] = {
      ...(next[extraction.primitiveKey] ?? {}),
      [extraction.fieldKey]: extraction.value,
    };
  }
  return next;
}

function buildSummary(state: InterviewSessionState): string {
  const lines = ["Here's what I've got so far:"];
  for (const primitiveKey of state.selectedPrimitives) {
    const values = state.fieldValues[primitiveKey];
    if (!values) continue;
    for (const [key, value] of Object.entries(values)) {
      lines.push(`- ${primitiveKey}.${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("Does this look right?");
  return lines.join("\n");
}

const CONFIRMATION_PHRASES = ["yes", "yep", "yeah", "correct", "looks good", "confirm", "that's right"];

/**
 * Deliberately deterministic keyword matching, not another LLM call — the
 * spec is explicit that termination must never be "an LLM guess that we're
 * done" (docs/architecture.md, "Interview Agent Design", point 7). A real
 * confirmation-detection pass could be more forgiving of phrasing, but it
 * must stay a clear, auditable rule, not a model's discretion.
 */
function isConfirmationText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return CONFIRMATION_PHRASES.some((phrase) => normalized.includes(phrase));
}

function lockLob(state: InterviewSessionState, lobKey: string): TurnResult {
  const recipe = findLobRecipe(lobKey) ?? findLobRecipe(FALLBACK_LOB_KEY);
  if (!recipe) {
    throw new Error(`Neither "${lobKey}" nor the fallback "${FALLBACK_LOB_KEY}" exist in lob_recipes`);
  }

  const nextState: InterviewSessionState = {
    ...state,
    lobKey: recipe.key,
    selectedPrimitives: recipe.defaultPrimitives,
  };
  const validation = validateDraft(currentDraft(nextState));
  const firstMissing = validation.missingRequiredFields[0];

  return {
    state: nextState,
    responseText: firstMissing ? firstMissing.interviewHint : buildSummary(nextState),
    done: false,
  };
}

/**
 * One turn of the interview (docs/architecture.md, "Interview Agent
 * Design"): the LLM never decides what's required — packages/schema's
 * primitive definitions do, via packages/compiler's validateDraft, which
 * this re-runs from stored field_values on every turn rather than tracking
 * conversation history. That's what makes a returning/resumed session's
 * "what's left" correct without replaying anything (point 8, resumability).
 */
export async function processTurn(
  state: InterviewSessionState,
  userText: string,
  deps: InterviewDeps,
): Promise<TurnResult> {
  if (!state.lobKey) {
    const classification = await classifyLob(userText, deps.classifyFn);

    if (classification.status === "low_confidence") {
      if (state.lobAmbiguityAsked) {
        // already asked once and it's still ambiguous — fall back rather than loop forever
        return lockLob(state, FALLBACK_LOB_KEY);
      }
      return {
        state: { ...state, lobAmbiguityAsked: true },
        responseText: "Could you tell me a bit more about what your business does or sells?",
        done: false,
      };
    }

    return lockLob(state, classification.lobKey);
  }

  const validation = validateDraft(currentDraft(state));

  if (validation.valid) {
    if (state.confirmed) {
      return { state, responseText: "All set! Your bot is ready.", done: true };
    }
    if (isConfirmationText(userText)) {
      return { state: { ...state, confirmed: true }, responseText: "Great, all set!", done: true };
    }
    return { state, responseText: buildSummary(state), done: false };
  }

  const { committed } = await extractFields(userText, validation.missingRequiredFields, deps.extractFn);
  const nextState: InterviewSessionState = { ...state, fieldValues: mergeExtractions(state.fieldValues, committed) };
  const nextValidation = validateDraft(currentDraft(nextState));

  if (nextValidation.valid) {
    return { state: nextState, responseText: buildSummary(nextState), done: false };
  }

  const nextMissing = nextValidation.missingRequiredFields[0];
  return {
    state: nextState,
    responseText: nextMissing ? nextMissing.interviewHint : "Let's continue.",
    done: false,
  };
}
