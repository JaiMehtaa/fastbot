import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "@whatsapp-bot-platform/compiler";
import type { CompiledConfig, DraftConfig, InboundMessage } from "@whatsapp-bot-platform/shared-types";
import { createInterpreter } from "./interpreter.js";
import type { FaqFallbackFn } from "./handlers/faq-support.js";
import type { WhatsAppOutboundButtonMessage, WhatsAppOutboundListMessage } from "./whatsapp-payload.js";

function retailDraft(): DraftConfig {
  return {
    draftSessionId: "runtime-test",
    version: 1,
    lobKey: "retail_d2c",
    selectedPrimitives: ["business_info", "catalogue", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: {
        business_name: "Zap Home Care",
        description: "We make dishwash and laundry care products.",
        hours: { mon_fri: "9:00-19:00" },
      },
      catalogue: {
        items: [
          { name: "ShineZap Dishwash Bar", link: "https://amazon.in/dp/shinezap" },
          { name: "CleanZap Detergent", link: "https://amazon.in/dp/cleanzap", featured: true },
        ],
      },
      faq_support: {
        faqs: [{ question: "Do you ship pan-India?", answer: "Yes, across India." }],
      },
      human_escalation: {
        escalation_prompt: "Someone from our team will reach out shortly.",
      },
    },
  };
}

function textMessage(text: string): InboundMessage {
  return { waId: "wa-1", messageId: `m-${Date.now()}-${Math.random()}`, type: "text", text, receivedAt: new Date().toISOString() };
}

function replyMessage(interactiveReplyId: string): InboundMessage {
  return {
    waId: "wa-1",
    messageId: `m-${Date.now()}-${Math.random()}`,
    type: "interactive",
    interactiveReplyId,
    receivedAt: new Date().toISOString(),
  };
}

const alwaysLowConfidenceFallback: FaqFallbackFn = async () => null;

let compiled: CompiledConfig;
test.before(() => {
  compiled = compile(retailDraft());
});

test("interpret renders the root menu on an unrecognized reply while in ROOT", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const result = await interpret(compiled, "ROOT", "wa-1", replyMessage("nonsense"));

  assert.equal(result.nextState, "ROOT");
  const payload = result.outboundPayload as WhatsAppOutboundListMessage;
  assert.equal(payload.interactive.type, "list");
});

test("interpret navigates from ROOT into catalogue's list view on the root menu entry tap", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const result = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_catalogue"));

  assert.equal(result.nextState, "CATALOGUE_LIST");
  const payload = result.outboundPayload as WhatsAppOutboundListMessage;
  assert.equal(payload.interactive.action.sections[0]?.rows.length, 2);
  // featured item should be surfaced first
  assert.match(payload.interactive.action.sections[0]?.rows[0]?.title ?? "", /⭐/);
});

test("interpret shows a catalogue item's detail and can navigate back to the list", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const list = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_catalogue"));
  const firstRowId = (list.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;

  const detail = await interpret(compiled, "CATALOGUE_LIST", "wa-1", replyMessage(firstRowId));
  assert.equal(detail.nextState, "CATALOGUE_ITEM_DETAIL");
  assert.match((detail.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /amazon\.in/);

  const back = await interpret(compiled, "CATALOGUE_ITEM_DETAIL", "wa-1", replyMessage("back_to_catalogue_list"));
  assert.equal(back.nextState, "CATALOGUE_LIST");
});

test("interpret answers a canned FAQ directly from the list", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const menu = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_faq_support"));
  const questionId = (menu.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;

  const answer = await interpret(compiled, "FAQ_MENU", "wa-1", replyMessage(questionId));
  assert.equal(answer.nextState, "FAQ_ANSWER");
  assert.match((answer.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /across India/);
});

test("interpret uses the LLM fallback for free text that doesn't match a canned FAQ", async () => {
  const fallback: FaqFallbackFn = async (question) => ({ answer: `Answer to: ${question}` });
  const interpret = createInterpreter(fallback);

  const result = await interpret(compiled, "FAQ_MENU", "wa-1", textMessage("Do you ship internationally?"));
  assert.equal(result.nextState, "FAQ_FALLBACK");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /Do you ship internationally/);
});

test("interpret hands off to human_escalation when the LLM fallback reports low confidence", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const result = await interpret(compiled, "FAQ_MENU", "wa-1", textMessage("Some totally off-topic question"));

  // faq_support's handler returned {nextState: "ESCALATION_CONFIRM"} with no payload;
  // the interpreter chased the handoff to human_escalation's handler, which produced
  // the actual escalation prompt in the same turn — never a silent state change.
  assert.equal(result.nextState, "ESCALATION_CONFIRM");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /reach out shortly/);
});

test("interpret confirming escalation creates a ticket and a dashboard notification side effect", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const result = await interpret(compiled, "ESCALATION_CONFIRM", "wa-1", replyMessage("escalation_confirm"));

  assert.equal(result.nextState, "ESCALATION_ACTIVE");
  assert.equal(result.sideEffects?.createTicket?.summary, "Someone from our team will reach out shortly.");
  assert.equal(result.sideEffects?.notifyDashboard?.type, "escalation");
});

test("interpret tapping Main Menu from any primitive state returns to ROOT", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const result = await interpret(compiled, "BUSINESS_INFO_VIEW", "wa-1", replyMessage("nav_main_menu"));

  assert.equal(result.nextState, "ROOT");
  assert.equal((result.outboundPayload as WhatsAppOutboundListMessage).interactive.type, "list");
});

test("interpret fails safe to ROOT when the current state no longer exists in the compiled config", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback);
  const result = await interpret(compiled, "SOME_REMOVED_STATE", "wa-1", replyMessage("anything"));
  assert.equal(result.nextState, "ROOT");
});
