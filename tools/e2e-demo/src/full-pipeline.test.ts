import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialState,
  heuristicClassifyCapabilities,
  heuristicExtractFields,
  heuristicExtractOwnerInfo,
  processTurn,
  type InterviewSessionState,
  type ScrapeWebsiteFn,
} from "@whatsapp-bot-platform/interview-api";
import {
  createInMemoryRepository,
  createInterpreter,
  createMockBspAdapter,
  issueSandboxBinding,
  processInboundMessage,
  promoteDraftToTenant,
  type WhatsAppOutboundButtonMessage,
  type WhatsAppOutboundListMessage,
} from "@whatsapp-bot-platform/runtime";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";

const DEMO_PHONE_NUMBER = "demo-phone-number-1";
const DEMO_WA_ID = "919999999999";

// The interview never touches the real network in this offline e2e suite —
// the script always declines the website step, so this is never actually
// called, but InterviewDeps requires a scrapeFn regardless.
const noScrape: ScrapeWebsiteFn = async () => ({ status: "unreachable", reason: "no scraping in this offline e2e suite" });

// Full stage sequence (apps/interview-api/src/interview-session.ts):
// owner_info -> detecting -> awaiting_more (one "anything else?" catch-all)
// -> awaiting_website -> locked. The first line answers owner_info; the
// third answers the catch-all ("questions" is heuristicClassifyCapabilities'
// faq_support keyword, so the locked set ends up {business_info, catalogue,
// faq_support, human_escalation}); the fourth declines the website step.
const INTERVIEW_SCRIPT = [
  "I'm Meadow, you can reach me at meadow@example.com",
  "I sell handmade soaps and skincare products online",
  "Yes, we also get a lot of questions from customers",
  "no website",
  "We're called Meadow Soaps",
  "We make natural handmade soaps using organic ingredients",
  "We're open 9am-6pm Monday to Friday",
  "Lavender Oatmeal Bar, https://meadowsoaps.example/lavender",
  "Q: Are your soaps vegan? A: Yes, all of them are.",
  "Someone from our team will get back to you soon",
];

interface Ran {
  state: InterviewSessionState;
  turns: { message: string; responseText: string }[];
}

/**
 * Drives the real heuristic classify/extract functions through the scripted
 * interview, deliberately reused across scenarios below rather than each
 * test hand-rolling its own copy — every scenario needs the same "did the
 * interview actually converge" starting point before it can probe a
 * different downstream failure mode.
 */
async function runScriptedInterview(script: readonly string[] = INTERVIEW_SCRIPT): Promise<Ran> {
  let state: InterviewSessionState = createInitialState(`e2e-demo-${Math.random().toString(36).slice(2)}`);
  const deps = { classifyFn: heuristicClassifyCapabilities, extractFn: heuristicExtractFields, extractOwnerInfoFn: heuristicExtractOwnerInfo, scrapeFn: noScrape };
  const turns: Ran["turns"] = [];
  for (const message of script) {
    const result = await processTurn(state, message, deps);
    turns.push({ message, responseText: result.responseText });
    state = result.state;
  }
  return { state, turns };
}

function failureContext(ran: Ran, state: InterviewSessionState): string {
  return `conversation transcript:\n${ran.turns.map((t) => `> ${t.message}\n< ${t.responseText}`).join("\n")}\n\nfinal state: ${JSON.stringify(state, null, 2)}`;
}

async function runInterviewToCompletion(): Promise<{ draft: DraftConfig; state: InterviewSessionState; ran: Ran }> {
  const deps = { classifyFn: heuristicClassifyCapabilities, extractFn: heuristicExtractFields, extractOwnerInfoFn: heuristicExtractOwnerInfo, scrapeFn: noScrape };
  const ran = await runScriptedInterview();
  let state = ran.state;
  assert.equal(state.lobKey, "retail_d2c", failureContext(ran, state));

  const confirmTurn = await processTurn(state, "yes that's correct", deps);
  state = confirmTurn.state;
  assert.equal(confirmTurn.done, true, failureContext(ran, state));

  const draft: DraftConfig = {
    draftSessionId: state.draftSessionId,
    version: 1,
    lobKey: state.lobKey,
    selectedPrimitives: state.selectedPrimitives,
    fieldValues: state.fieldValues,
  };
  return { draft, state, ran };
}

async function buildPromotedTenant(phoneNumberId: string = DEMO_PHONE_NUMBER) {
  const { draft, state } = await runInterviewToCompletion();
  const repository = createInMemoryRepository();
  const { tenantId } = await promoteDraftToTenant(draft, phoneNumberId, repository);
  return { tenantId, repository, state };
}

/**
 * Proves the whole promise end to end with zero live credentials: a
 * scripted conversation runs through the real heuristic classify/extract
 * functions and the real processTurn() state machine, the completed
 * interview is compiled and promoted to a live tenant, and a real
 * WhatsApp-shaped inbound message is then answered correctly by
 * apps/runtime's generic interpreter — proving every piece built so far is
 * actually wired together, not just independently unit-tested.
 */
test("full pipeline: scripted interview -> promoted tenant -> real WhatsApp conversation", async () => {
  const { repository } = await buildPromotedTenant();

  const bspAdapter = createMockBspAdapter();
  const interpret = createInterpreter(async () => null, repository);
  const runtimeDeps = { repository, bspAdapter, interpret, sandboxPhoneNumberId: "unused-sandbox-number" };

  const greeting = await processInboundMessage(
    DEMO_PHONE_NUMBER,
    { waId: DEMO_WA_ID, messageId: "m1", type: "text", text: "hi", receivedAt: new Date().toISOString() },
    runtimeDeps,
  );
  assert.equal(greeting.status, "processed");
  const rootMenuMessage = bspAdapter.sentMessages[0] as WhatsAppOutboundListMessage;
  assert.equal(rootMenuMessage.interactive.type, "list");
  assert.match(rootMenuMessage.interactive.header?.text ?? "", /Meadow Soaps/i);

  const catalogueTap = await processInboundMessage(
    DEMO_PHONE_NUMBER,
    {
      waId: DEMO_WA_ID,
      messageId: "m2",
      type: "interactive",
      interactiveReplyId: "root_catalogue",
      receivedAt: new Date().toISOString(),
    },
    runtimeDeps,
  );
  assert.equal(catalogueTap.status, "processed");
  const catalogueMessage = bspAdapter.sentMessages[1] as WhatsAppOutboundListMessage;
  assert.match(catalogueMessage.interactive.action.sections[0]?.rows[0]?.title ?? "", /Lavender Oatmeal Bar/);
});

test("runtime: unrecognized root-menu tap falls back to the root menu instead of erroring", async () => {
  const { repository } = await buildPromotedTenant("demo-phone-number-2");
  const bspAdapter = createMockBspAdapter();
  const interpret = createInterpreter(async () => null, repository);
  const runtimeDeps = { repository, bspAdapter, interpret, sandboxPhoneNumberId: "unused-sandbox-number" };
  const waId = "919999999901";

  const result = await processInboundMessage(
    "demo-phone-number-2",
    { waId, messageId: "m1", type: "interactive", interactiveReplyId: "root_nonexistent_entry", receivedAt: new Date().toISOString() },
    runtimeDeps,
  );

  assert.equal(result.status, "processed");
  const message = bspAdapter.sentMessages[0] as WhatsAppOutboundListMessage;
  assert.equal(message.interactive.type, "list");
  assert.match(message.interactive.header?.text ?? "", /Meadow Soaps/i);
});

test("runtime: FAQ tap returns the canned answer and back-to-list re-renders the list", async () => {
  const { repository } = await buildPromotedTenant("demo-phone-number-3");
  const bspAdapter = createMockBspAdapter();
  const interpret = createInterpreter(async () => null, repository);
  const runtimeDeps = { repository, bspAdapter, interpret, sandboxPhoneNumberId: "unused-sandbox-number" };
  const waId = "919999999902";

  await processInboundMessage(
    "demo-phone-number-3",
    { waId, messageId: "m1", type: "interactive", interactiveReplyId: "root_faq_support", receivedAt: new Date().toISOString() },
    runtimeDeps,
  );
  const faqList = bspAdapter.sentMessages[0] as WhatsAppOutboundListMessage;
  assert.equal(faqList.interactive.type, "list");
  const firstRow = faqList.interactive.action.sections[0]?.rows[0];
  assert.match(firstRow?.title ?? "", /vegan/i);

  await processInboundMessage(
    "demo-phone-number-3",
    {
      waId,
      messageId: "m2",
      type: "interactive",
      interactiveReplyId: firstRow?.id,
      receivedAt: new Date().toISOString(),
    },
    runtimeDeps,
  );
  const faqAnswer = bspAdapter.sentMessages[1] as WhatsAppOutboundButtonMessage;
  assert.equal(faqAnswer.interactive.type, "button");
  assert.match(faqAnswer.interactive.body.text, /yes, all of them are/i);

  const backToList = faqAnswer.interactive.action.buttons.find((b) => b.reply.title.includes("Back to FAQs"));
  assert.ok(backToList, "expected a 'Back to FAQs' button on the answer message");
  await processInboundMessage(
    "demo-phone-number-3",
    { waId, messageId: "m3", type: "interactive", interactiveReplyId: backToList!.reply.id, receivedAt: new Date().toISOString() },
    runtimeDeps,
  );
  const faqListAgain = bspAdapter.sentMessages[2] as WhatsAppOutboundListMessage;
  assert.equal(faqListAgain.interactive.type, "list");
});

test("runtime: an unmatched free-text question hands off to human escalation and confirming it creates a ticket + dashboard notification", async () => {
  const { repository, tenantId } = await buildPromotedTenant("demo-phone-number-4");
  const bspAdapter = createMockBspAdapter();
  // fallback always returns null here -> every free-text FAQ question is "low confidence"
  const interpret = createInterpreter(async () => null, repository);
  const runtimeDeps = { repository, bspAdapter, interpret, sandboxPhoneNumberId: "unused-sandbox-number" };
  const waId = "919999999903";

  await processInboundMessage(
    "demo-phone-number-4",
    { waId, messageId: "m1", type: "interactive", interactiveReplyId: "root_faq_support", receivedAt: new Date().toISOString() },
    runtimeDeps,
  );

  // free text while in FAQ_MENU, not matching any canned question -> low-confidence
  // fallback -> generic interpreter hands off from faq_support straight into
  // human_escalation's ESCALATION_CONFIRM state, no per-primitive special casing
  await processInboundMessage(
    "demo-phone-number-4",
    { waId, messageId: "m2", type: "text", text: "do you ship internationally?", receivedAt: new Date().toISOString() },
    runtimeDeps,
  );
  const escalationPrompt = bspAdapter.sentMessages[1] as WhatsAppOutboundButtonMessage;
  assert.equal(escalationPrompt.interactive.type, "button");
  assert.match(escalationPrompt.interactive.body.text, /team will get back to you soon/i);

  const confirmButton = escalationPrompt.interactive.action.buttons.find((b) => b.reply.id === "escalation_confirm");
  assert.ok(confirmButton, "expected an 'escalation_confirm' button");
  await processInboundMessage(
    "demo-phone-number-4",
    { waId, messageId: "m3", type: "interactive", interactiveReplyId: confirmButton!.reply.id, receivedAt: new Date().toISOString() },
    runtimeDeps,
  );

  assert.equal(repository.supportTickets.length, 1);
  assert.equal(repository.supportTickets[0]?.contextId, tenantId);
  assert.equal(repository.dashboardNotifications.length, 1);
  assert.equal(repository.dashboardNotifications[0]?.type, "escalation");
});

test("interview: a garbage answer to a required field is not committed and the same question is asked again", async () => {
  const deps = { classifyFn: heuristicClassifyCapabilities, extractFn: heuristicExtractFields, extractOwnerInfoFn: heuristicExtractOwnerInfo, scrapeFn: noScrape };
  // stop right after owner_info + capability lock + website decline + business_name +
  // description, right when hours is being asked, then answer with noise that
  // heuristicExtractFields' weekly_hours matcher can't parse
  const ran = await runScriptedInterview(INTERVIEW_SCRIPT.slice(0, 6));
  let state = ran.state;
  const beforeFieldValues = JSON.stringify(state.fieldValues);

  const garbageTurn = await processTurn(state, "asdkjhaskjdh???", deps);
  assert.equal(JSON.stringify(garbageTurn.state.fieldValues), beforeFieldValues, failureContext(ran, garbageTurn.state));
  assert.equal(garbageTurn.responseText, ran.turns[ran.turns.length - 1]!.responseText);

  // recovering with a real answer afterwards still works — the session wasn't corrupted
  const recoveryTurn = await processTurn(garbageTurn.state, "We're open 9am-6pm Monday to Friday", deps);
  state = recoveryTurn.state;
  assert.notEqual(JSON.stringify(state.fieldValues), beforeFieldValues, failureContext(ran, state));
});

const SANDBOX_PHONE_NUMBER_ID = "sandbox-phone-number-id";
const SANDBOX_WHATSAPP_NUMBER = "911234567890";

/**
 * Proves the actual pre-signup product flow, not just the post-signup one:
 * a completed interview issues a sandbox join-token (never promoted to a
 * tenant, never bound to a real phone number), a prospect's real
 * WhatsApp-shaped "JOIN <token>" message binds to it, and every message
 * after that resolves through the exact same generic interpreter a live
 * tenant uses — proving resolveContext's draft path, not just its tenant
 * path, is genuinely wired end to end.
 */
test("sandbox pipeline: scripted interview -> sandbox join token -> real WhatsApp conversation, no tenant ever created", async () => {
  const { draft } = await runInterviewToCompletion();
  const repository = createInMemoryRepository();

  const { token, joinUrl } = await issueSandboxBinding(draft, SANDBOX_WHATSAPP_NUMBER, repository);
  assert.match(joinUrl, new RegExp(`^https://wa\\.me/${SANDBOX_WHATSAPP_NUMBER}\\?text=`));

  const bspAdapter = createMockBspAdapter();
  const interpret = createInterpreter(async () => null, repository);
  const runtimeDeps = { repository, bspAdapter, interpret, sandboxPhoneNumberId: SANDBOX_PHONE_NUMBER_ID };
  const testerWaId = "919888888888";

  const join = await processInboundMessage(
    SANDBOX_PHONE_NUMBER_ID,
    { waId: testerWaId, messageId: "s1", type: "text", text: `JOIN ${token}`, receivedAt: new Date().toISOString() },
    runtimeDeps,
  );
  assert.equal(join.status, "processed");
  const rootMenuMessage = bspAdapter.sentMessages[0] as WhatsAppOutboundListMessage;
  assert.match(rootMenuMessage.interactive.header?.text ?? "", /Meadow Soaps/i);

  // a second message from the same tester, with no token — resolves via the
  // now-bound draft, exactly like a live tenant would resolve by phone_number_id
  const catalogueTap = await processInboundMessage(
    SANDBOX_PHONE_NUMBER_ID,
    { waId: testerWaId, messageId: "s2", type: "interactive", interactiveReplyId: "root_catalogue", receivedAt: new Date().toISOString() },
    runtimeDeps,
  );
  assert.equal(catalogueTap.status, "processed");
  const catalogueMessage = bspAdapter.sentMessages[1] as WhatsAppOutboundListMessage;
  assert.match(catalogueMessage.interactive.action.sections[0]?.rows[0]?.title ?? "", /Lavender Oatmeal Bar/);

  // never promoted — no live tenant exists for any real phone number
  assert.equal(await repository.getTenantByPhoneNumberId(DEMO_PHONE_NUMBER), null);
});
