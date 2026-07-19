import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";

export type PersonaStyle = "clean" | "verbose" | "terse" | "ambiguous" | "contradictory";

export interface PersonaProfile {
  groundTruth: DraftConfig;
  style: PersonaStyle;
  /** deliberately messy natural-language material — never the structured ground truth verbatim */
  material: string;
}

export type RenderPersonaFn = (context: { groundTruth: DraftConfig; style: PersonaStyle }) => Promise<string>;

/**
 * Renders a ground-truth DraftConfig into messy natural-language material a
 * persona can speak from. The persona-simulator below only ever sees this
 * material, never the structured ground truth — that's what forces the real
 * interview agent under test to do genuine extraction work instead of being
 * fed a structured answer key in disguise.
 */
export async function renderPersona(
  groundTruth: DraftConfig,
  style: PersonaStyle,
  renderFn: RenderPersonaFn,
): Promise<PersonaProfile> {
  const material = await renderFn({ groundTruth, style });
  if (!material || material.trim().length === 0) {
    throw new Error("renderPersona: renderFn returned empty material");
  }
  return { groundTruth, style, material };
}

export interface PersonaTurn {
  question: string;
  answer: string;
}

export interface PersonaTurnContext {
  profile: PersonaProfile;
  question: string;
  history: readonly PersonaTurn[];
}

export type SimulatePersonaTurnFn = (context: PersonaTurnContext) => Promise<string>;

/**
 * One turn of the synthetic "business owner" answering whatever the real
 * interview agent asked, sourced only from `profile.material` + prior turns.
 */
export async function simulatePersonaTurn(
  context: PersonaTurnContext,
  simulateFn: SimulatePersonaTurnFn,
): Promise<string> {
  const answer = await simulateFn(context);
  if (!answer || answer.trim().length === 0) {
    throw new Error("simulatePersonaTurn: simulateFn returned an empty answer");
  }
  return answer;
}
