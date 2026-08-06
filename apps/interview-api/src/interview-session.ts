import { getPrimitive, listPrimitives } from "@whatsapp-bot-platform/schema";
import { validateDraft } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";
import { classifyCapabilities, sortByCanonicalOrder, type ClassifyCapabilitiesFn } from "./capability-classifier.js";
import { extractFields, type ExtractFieldsFn, type FieldExtraction } from "./field-extractor.js";
import { extractOwnerInfo, type ExtractOwnerInfoFn } from "./owner-info-extractor.js";
import { identityPhraseQuestion, type PhraseQuestionFn } from "./question-phraser.js";
import type { ScrapeWebsiteFn } from "./website-scraper.js";

/**
 * Column name in the DB (draft_sessions.capability_stage, migration
 * 20260104000000) predates owner_info/awaiting_website — kept as-is rather
 * than renamed to avoid migration churn for a cosmetic rename; db-session-
 * store.ts documents the mapping. The TS type name tracks what it actually
 * represents today: the whole interview's stage, not just capability
 * detection.
 */
export type InterviewStage = "owner_info" | "detecting" | "awaiting_more" | "awaiting_website" | "locked";

export interface InterviewSessionState {
  draftSessionId: string;
  /**
   * Informational label only — no longer gates which primitives get
   * selected (see interviewStage/selectedPrimitives below). Kept because
   * draft_configs.lob_key, apps/dashboard, and apps/web's interview-chat
   * component all display it; best-effort set from the classifier's own
   * reasoning, "custom" when the detected set doesn't match a known shape.
   */
  lobKey: string | null;
  interviewStage: InterviewStage;
  ownerName: string | null;
  ownerContact: string | null;
  /** true once we've already asked one owner-info follow-up this session */
  ownerInfoAsked: boolean;
  /** true once we've already asked one capability clarifying question this session */
  capabilityAmbiguityAsked: boolean;
  /** primitives detected before the "anything else?" catch-all is answered; null once locked */
  pendingPrimitives: readonly PrimitiveKey[] | null;
  selectedPrimitives: readonly PrimitiveKey[];
  fieldValues: DraftConfig["fieldValues"];
  confirmed: boolean;
}

export function createInitialState(draftSessionId: string): InterviewSessionState {
  return {
    draftSessionId,
    lobKey: null,
    interviewStage: "owner_info",
    ownerName: null,
    ownerContact: null,
    ownerInfoAsked: false,
    capabilityAmbiguityAsked: false,
    pendingPrimitives: null,
    selectedPrimitives: [],
    fieldValues: {},
    confirmed: false,
  };
}

export interface InterviewDeps {
  classifyFn: ClassifyCapabilitiesFn;
  extractFn: ExtractFieldsFn;
  extractOwnerInfoFn: ExtractOwnerInfoFn;
  scrapeFn: ScrapeWebsiteFn;
  /** optional — defaults to identityPhraseQuestion (raw static text), same zero-config posture as every other dep */
  phraseFn?: PhraseQuestionFn;
}

export interface TurnResult {
  state: InterviewSessionState;
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

const DECLINE_PHRASES = ["no", "nope", "nothing", "that's all", "thats all", "all good", "none"];

function isDeclineText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return DECLINE_PHRASES.some((phrase) => normalized.includes(phrase));
}

const URL_PATTERN = /https?:\/\/\S+/i;
// A bare domain typed without a scheme (e.g. "example.com") — found live via QA
// testing that this read identically to declining, with zero acknowledgement the
// input wasn't understood. Requires a letter TLD (excludes plain numbers like
// "9.30") and no whitespace inside the match.
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?\b/i;

function extractFirstUrl(text: string): string | null {
  const schemeMatch = URL_PATTERN.exec(text);
  if (schemeMatch) return schemeMatch[0].replace(/[),.;]+$/, "");

  const bareMatch = BARE_DOMAIN_PATTERN.exec(text);
  if (bareMatch) return `https://${bareMatch[0].replace(/[),.;]+$/, "")}`;

  return null;
}

/**
 * Best-effort informational label — see InterviewSessionState.lobKey's
 * comment. Not used for selection; purely for display.
 */
function describeLob(primitives: readonly PrimitiveKey[]): string {
  const nonBaseline = primitives.filter((key) => key !== "business_info" && key !== "human_escalation");
  if (nonBaseline.length === 0) return "minimal_support";
  if (nonBaseline.includes("catalogue") && nonBaseline.includes("faq_support") && nonBaseline.length === 2) {
    return "retail_d2c";
  }
  return "custom";
}

interface RespondInput {
  state: InterviewSessionState;
  rawText: string;
  /** skip phraseFn — for data the user needs to verify exactly (the field-value summary), never paraphrased */
  verbatim?: boolean;
}

/**
 * Every response funnels through here so the interview's actual voice goes
 * through deps.phraseFn (real OpenAI in production, identityPhraseQuestion
 * — the raw static text unchanged — for createServer()'s zero-config
 * default) instead of always echoing packages/schema's static interviewHint
 * strings verbatim. Never applied to the field-value summary: that's a
 * factual confirmation step the user needs to verify exactly, not a
 * question to make friendlier.
 */
async function respond(deps: InterviewDeps, input: RespondInput, done: boolean): Promise<TurnResult> {
  const phraseFn = deps.phraseFn ?? identityPhraseQuestion;
  const responseText = input.verbatim
    ? input.rawText
    : await phraseFn({
        rawText: input.rawText,
        ownerName: input.state.ownerName,
        businessName: (input.state.fieldValues.business_info?.business_name as string | undefined) ?? null,
      });
  return { state: input.state, responseText, done };
}

function ownerInfoFollowUp(missingName: boolean, missingContact: boolean): string {
  if (missingName && missingContact) return "What's your name, and what's the best way to reach you — phone or email?";
  if (missingName) return "And what's your name?";
  return "And what's the best way to reach you — phone or email?";
}

/**
 * Examples are drawn live from listPrimitives(), never hardcoded — a
 * hardcoded "appointments, capturing leads" here would name-drop
 * primitives that may not even be registered yet (found live: it did,
 * before booking existed — a customer who'd already asked for
 * appointments got asked about them again, and even a "yes" would have
 * had nothing real to attach to). Once a primitive like booking is
 * registered, it starts appearing here automatically.
 */
function suggestExamples(pendingPrimitives: readonly PrimitiveKey[]): string {
  const remaining = listPrimitives()
    .map((schema) => schema.key)
    .filter((key) => key !== "business_info" && key !== "human_escalation" && !pendingPrimitives.includes(key));
  if (remaining.length === 0) return "anything else you'd like this bot to handle";
  const labels = remaining.slice(0, 2).map((key) => getPrimitive(key).label.toLowerCase());
  return `anything else you'd like this bot to handle — ${labels.join(", ")}, or anything else`;
}

function askAnythingElse(state: InterviewSessionState, pendingPrimitives: readonly PrimitiveKey[]): RespondInput {
  return {
    state: { ...state, interviewStage: "awaiting_more", pendingPrimitives },
    rawText: `Got it. Is there ${suggestExamples(pendingPrimitives)}? (Just say "no" if that's everything.)`,
  };
}

function lockCapabilities(state: InterviewSessionState, primitives: readonly PrimitiveKey[], lobKeyOverride?: string): RespondInput {
  const nextState: InterviewSessionState = {
    ...state,
    lobKey: lobKeyOverride ?? describeLob(primitives),
    interviewStage: "awaiting_website",
    pendingPrimitives: null,
    selectedPrimitives: primitives,
  };
  return {
    state: nextState,
    rawText: "Do you have a website? Share the link and I'll pull in what I can to save you typing — otherwise just say no.",
  };
}

/**
 * Computes whatever comes after capability selection is fully settled
 * (website answered/scraped/skipped): the next missing field's question, or
 * the summary once everything required is filled. Shared by every path that
 * lands in the "locked" stage — declining the website prompt, a URL that
 * fails to scrape, and a successful scrape all funnel through this.
 */
function enterFieldLoop(state: InterviewSessionState, prefix?: string): RespondInput {
  const locked: InterviewSessionState = { ...state, interviewStage: "locked" };
  const validation = validateDraft(currentDraft(locked));
  const firstMissing = validation.missingRequiredFields[0];
  if (!firstMissing) {
    return { state: locked, rawText: buildSummary(locked), verbatim: true };
  }
  const question = prefix ? `${prefix} ${firstMissing.interviewHint}` : firstMissing.interviewHint;
  return { state: locked, rawText: question };
}

/**
 * One turn of the interview (docs/architecture.md, "Interview Agent
 * Design"): the LLM never decides what's required — packages/schema's
 * primitive definitions do, via packages/compiler's validateDraft, which
 * this re-runs from stored field_values on every turn rather than tracking
 * conversation history. That's what makes a returning/resumed session's
 * "what's left" correct without replaying anything (point 8, resumability).
 *
 * Full stage sequence: owner_info (who's setting this up) -> detecting
 * (capability classification) -> awaiting_more (one open catch-all) ->
 * awaiting_website (optional scrape to pre-fill fields) -> locked (the
 * generic missing-field loop). Capability candidates always come from
 * packages/schema's listPrimitives(), so a new primitive (e.g. booking)
 * becomes selectable the moment it's registered — nothing here needs to
 * change to support it.
 */
export async function processTurn(
  state: InterviewSessionState,
  userText: string,
  deps: InterviewDeps,
): Promise<TurnResult> {
  if (state.interviewStage === "owner_info") {
    const extracted = await extractOwnerInfo(userText, deps.extractOwnerInfoFn);
    const ownerName = state.ownerName ?? extracted.name;
    const ownerContact = state.ownerContact ?? extracted.contact;
    const missingName = !ownerName;
    const missingContact = !ownerContact;

    if (!missingName && !missingContact) {
      const nextState: InterviewSessionState = { ...state, ownerName, ownerContact, interviewStage: "detecting" };
      return respond(
        deps,
        {
          state: nextState,
          rawText:
            "Great to meet you! Now, tell me a bit about your business — what you sell, or the kind of support you'd like this bot to handle.",
        },
        false,
      );
    }

    if (!state.ownerInfoAsked) {
      const nextState: InterviewSessionState = { ...state, ownerName, ownerContact, ownerInfoAsked: true };
      return respond(deps, { state: nextState, rawText: ownerInfoFollowUp(missingName, missingContact) }, false);
    }

    // already asked once and something's still missing — never let owner info block the rest of the interview
    const nextState: InterviewSessionState = { ...state, ownerName, ownerContact, interviewStage: "detecting" };
    return respond(
      deps,
      {
        state: nextState,
        rawText: "No worries — tell me a bit about your business: what you sell, or the kind of support you'd like this bot to handle.",
      },
      false,
    );
  }

  if (state.interviewStage === "detecting") {
    const candidates = listPrimitives();
    const classification = await classifyCapabilities(userText, candidates, deps.classifyFn);

    if (classification.status === "low_confidence") {
      if (state.capabilityAmbiguityAsked) {
        // already asked once and it's still ambiguous — fall back to the safe minimal
        // shape rather than loop forever (minimal_support: business_info + faq_support + human_escalation)
        return respond(deps, lockCapabilities(state, ["business_info", "faq_support", "human_escalation"], "minimal_support"), false);
      }
      return respond(
        deps,
        { state: { ...state, capabilityAmbiguityAsked: true }, rawText: "Could you tell me a bit more about what your business does or sells?" },
        false,
      );
    }

    return respond(deps, askAnythingElse(state, classification.selectedPrimitives), false);
  }

  if (state.interviewStage === "awaiting_more") {
    const pending = state.pendingPrimitives ?? [];
    if (isDeclineText(userText)) {
      return respond(deps, lockCapabilities(state, pending), false);
    }

    const candidates = listPrimitives().filter((schema) => !pending.includes(schema.key));
    const followUp =
      candidates.length > 0 ? await classifyCapabilities(userText, candidates, deps.classifyFn) : ({ status: "classified", selectedPrimitives: [] } as const);

    const additional = followUp.status === "classified" ? followUp.selectedPrimitives : [];
    return respond(deps, lockCapabilities(state, sortByCanonicalOrder([...new Set([...pending, ...additional])])), false);
  }

  if (state.interviewStage === "awaiting_website") {
    if (isDeclineText(userText)) {
      return respond(deps, enterFieldLoop(state), false);
    }

    const url = extractFirstUrl(userText);
    if (!url) {
      return respond(deps, enterFieldLoop(state), false);
    }

    const scraped = await deps.scrapeFn(url);
    if (scraped.status !== "ok") {
      return respond(deps, enterFieldLoop(state, "I couldn't reach that site, no worries —"), false);
    }

    const probe: InterviewSessionState = { ...state, interviewStage: "locked" };
    const validation = validateDraft(currentDraft(probe));
    const { committed } = await extractFields(scraped.site.text, validation.missingRequiredFields, deps.extractFn);
    let fieldValues = mergeExtractions(state.fieldValues, committed);
    // the URL itself is a deterministic fact, not something to infer — store it directly rather
    // than depending on the extractor noticing it in the scraped text (website is an optional field,
    // so it's never in missingRequiredFields and would otherwise never get committed)
    if (state.selectedPrimitives.includes("business_info")) {
      fieldValues = { ...fieldValues, business_info: { ...fieldValues.business_info, website: scraped.site.url } };
    }
    const nextState: InterviewSessionState = { ...probe, fieldValues };
    const prefix =
      committed.length > 0
        ? "Nice, I pulled in some details from your site."
        : "I had a look at your site but couldn't pull in much automatically — no problem,";
    return respond(deps, enterFieldLoop(nextState, prefix), false);
  }

  const validation = validateDraft(currentDraft(state));

  if (validation.valid) {
    if (state.confirmed) {
      return respond(deps, { state, rawText: "All set! Your bot is ready." }, true);
    }
    if (isConfirmationText(userText)) {
      return respond(deps, { state: { ...state, confirmed: true }, rawText: "Great, all set!" }, true);
    }
    return respond(deps, { state, rawText: buildSummary(state), verbatim: true }, false);
  }

  const { committed } = await extractFields(userText, validation.missingRequiredFields, deps.extractFn);
  const nextState: InterviewSessionState = { ...state, fieldValues: mergeExtractions(state.fieldValues, committed) };
  const nextValidation = validateDraft(currentDraft(nextState));

  if (nextValidation.valid) {
    return respond(deps, { state: nextState, rawText: buildSummary(nextState), verbatim: true }, false);
  }

  const nextMissing = nextValidation.missingRequiredFields[0];
  return respond(deps, { state: nextState, rawText: nextMissing ? nextMissing.interviewHint : "Let's continue." }, false);
}
