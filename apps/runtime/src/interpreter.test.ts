import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "@whatsapp-bot-platform/compiler";
import type { CompiledConfig, DraftConfig, InboundMessage } from "@whatsapp-bot-platform/shared-types";
import { createInterpreter } from "./interpreter.js";
import type { FaqFallbackFn } from "./handlers/faq-support.js";
import { createInMemoryRepository } from "./repository.js";
import type { WhatsAppOutboundButtonMessage, WhatsAppOutboundListMessage } from "./whatsapp-payload.js";

function retailDraft(): DraftConfig {
  return {
    draftSessionId: "runtime-test",
    version: 1,
    lobKey: "retail_d2c",
    selectedPrimitives: ["business_info", "catalogue", "faq_support", "human_escalation", "lead_capture"],
    fieldValues: {
      business_info: {
        business_name: "Zap Home Care",
        description: "We make dishwash and laundry care products.",
        hours: { mon_fri: "9:00-19:00" },
      },
      catalogue: {
        items: [
          { name: "ShineZap Dishwash Bar", link: "https://amazon.in/dp/shinezap" },
          {
            name: "CleanZap Detergent",
            link: "https://amazon.in/dp/cleanzap",
            featured: true,
            image_url: "https://example.com/cleanzap.jpg",
          },
        ],
      },
      faq_support: {
        faqs: [{ question: "Do you ship pan-India?", answer: "Yes, across India." }],
      },
      human_escalation: {
        escalation_prompt: "Someone from our team will reach out shortly.",
      },
      lead_capture: {
        capture_prompt: "Leave your name, phone number, and what you're looking for.",
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
const TEST_CONTEXT = { contextType: "tenant" as const, contextId: "tenant-1" };

let compiled: CompiledConfig;
test.before(() => {
  compiled = compile(retailDraft());
});

test("interpret renders the root menu on an unrecognized reply while in ROOT", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "ROOT", "wa-1", replyMessage("nonsense"), TEST_CONTEXT);

  assert.equal(result.nextState, "ROOT");
  const payload = result.outboundPayload as WhatsAppOutboundListMessage;
  assert.equal(payload.interactive.type, "list");
});

test("interpret navigates from ROOT into catalogue's list view on the root menu entry tap", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_catalogue"), TEST_CONTEXT);

  assert.equal(result.nextState, "CATALOGUE_LIST");
  const payload = result.outboundPayload as WhatsAppOutboundListMessage;
  // 2 real items + the always-present "Main Menu" row (see catalogue.ts's MAX_CATALOGUE_ITEMS)
  assert.equal(payload.interactive.action.sections[0]?.rows.length, 3);
  // featured item should be surfaced first
  assert.match(payload.interactive.action.sections[0]?.rows[0]?.title ?? "", /⭐/);
});

test("interpret's catalogue list always includes a Main Menu row, and tapping it navigates back to ROOT", async () => {
  // Regression test: a WhatsApp list message's single button only opens the
  // list — it can't carry a second button the way a button-type message
  // can — so before this fix, a customer who opened Browse Products and
  // wanted none of the items had no way back except picking one anyway.
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const list = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_catalogue"), TEST_CONTEXT);
  const rows = (list.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  const mainMenuRow = rows.find((r) => r.id === "nav_main_menu");
  assert.ok(mainMenuRow, "expected a nav_main_menu row in the catalogue list");

  const backToRoot = await interpret(compiled, "CATALOGUE_LIST", "wa-1", replyMessage("nav_main_menu"), TEST_CONTEXT);
  assert.equal(backToRoot.nextState, "ROOT");
  assert.equal((backToRoot.outboundPayload as WhatsAppOutboundListMessage).interactive.type, "list");
});

test("interpret shows a catalogue item's detail and can navigate back to the list", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const list = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_catalogue"), TEST_CONTEXT);
  const firstRowId = (list.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;

  const detail = await interpret(compiled, "CATALOGUE_LIST", "wa-1", replyMessage(firstRowId), TEST_CONTEXT);
  assert.equal(detail.nextState, "CATALOGUE_ITEM_DETAIL");
  assert.match((detail.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /amazon\.in/);
  // regression: image_url used to be captured but silently dropped on render
  assert.match((detail.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /cleanzap\.jpg/);

  const back = await interpret(compiled, "CATALOGUE_ITEM_DETAIL", "wa-1", replyMessage("back_to_catalogue_list"), TEST_CONTEXT);
  assert.equal(back.nextState, "CATALOGUE_LIST");
});

test("interpret answers a canned FAQ directly from the list", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const menu = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_faq_support"), TEST_CONTEXT);
  const questionId = (menu.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows[0]?.id as string;

  const answer = await interpret(compiled, "FAQ_MENU", "wa-1", replyMessage(questionId), TEST_CONTEXT);
  assert.equal(answer.nextState, "FAQ_ANSWER");
  assert.match((answer.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /across India/);
});

test("interpret's FAQ list always includes a Main Menu row, and tapping it navigates back to ROOT", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const menu = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_faq_support"), TEST_CONTEXT);
  const rows = (menu.outboundPayload as WhatsAppOutboundListMessage).interactive.action.sections[0]?.rows ?? [];
  const mainMenuRow = rows.find((r) => r.id === "nav_main_menu");
  assert.ok(mainMenuRow, "expected a nav_main_menu row in the FAQ list");

  const backToRoot = await interpret(compiled, "FAQ_MENU", "wa-1", replyMessage("nav_main_menu"), TEST_CONTEXT);
  assert.equal(backToRoot.nextState, "ROOT");
});

test("interpret uses the LLM fallback for free text that doesn't match a canned FAQ", async () => {
  const fallback: FaqFallbackFn = async (question) => ({ answer: `Answer to: ${question}` });
  const interpret = createInterpreter(fallback, createInMemoryRepository());

  const result = await interpret(compiled, "FAQ_MENU", "wa-1", textMessage("Do you ship internationally?"), TEST_CONTEXT);
  assert.equal(result.nextState, "FAQ_FALLBACK");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /Do you ship internationally/);
});

test("interpret hands off to human_escalation when the LLM fallback reports low confidence", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "FAQ_MENU", "wa-1", textMessage("Some totally off-topic question"), TEST_CONTEXT);

  // faq_support's handler returned {nextState: "ESCALATION_CONFIRM"} with no payload;
  // the interpreter chased the handoff to human_escalation's handler, which produced
  // the actual escalation prompt in the same turn — never a silent state change.
  assert.equal(result.nextState, "ESCALATION_CONFIRM");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /reach out shortly/);
});

test("interpret confirming escalation creates a ticket and a dashboard notification side effect", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "ESCALATION_CONFIRM", "wa-1", replyMessage("escalation_confirm"), TEST_CONTEXT);

  assert.equal(result.nextState, "ESCALATION_ACTIVE");
  assert.equal(result.sideEffects?.createTicket?.summary, "Someone from our team will reach out shortly.");
  assert.equal(result.sideEffects?.notifyDashboard?.type, "escalation");
});

test("interpret shows the lead capture prompt on root menu entry", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "ROOT", "wa-1", replyMessage("root_lead_capture"), TEST_CONTEXT);

  assert.equal(result.nextState, "LEAD_CAPTURE_START");
  assert.match(
    (result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text,
    /Leave your name, phone number/,
  );
});

test("interpret captures a lead's free-text reply, creating a ticket and a 'lead' dashboard notification", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(
    compiled,
    "LEAD_CAPTURE_START",
    "wa-1",
    textMessage("Jai, 9999999999, interested in laundry care products"),
    TEST_CONTEXT,
  );

  assert.equal(result.nextState, "LEAD_CAPTURE_CONFIRM");
  assert.equal(result.sideEffects?.createTicket?.summary, "Jai, 9999999999, interested in laundry care products");
  assert.equal(result.sideEffects?.notifyDashboard?.type, "lead");
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /in touch soon/);
});

test("interpret treats a whitespace-only reply as no answer, not a valid lead", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "LEAD_CAPTURE_START", "wa-1", textMessage("   "), TEST_CONTEXT);

  assert.equal(result.nextState, "LEAD_CAPTURE_START");
  assert.equal(result.sideEffects, undefined);
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /Leave your name, phone number/);
});

test("interpret doesn't re-ask for lead details once already confirmed", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "LEAD_CAPTURE_CONFIRM", "wa-1", textMessage("anything else"), TEST_CONTEXT);

  assert.equal(result.nextState, "LEAD_CAPTURE_CONFIRM");
  assert.equal(result.sideEffects, undefined);
  assert.match((result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text, /already has your details/);
});

test("interpret tapping Main Menu from any primitive state returns to ROOT", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "BUSINESS_INFO_VIEW", "wa-1", replyMessage("nav_main_menu"), TEST_CONTEXT);

  assert.equal(result.nextState, "ROOT");
  assert.equal((result.outboundPayload as WhatsAppOutboundListMessage).interactive.type, "list");
});

test("interpret fails safe to ROOT when the current state no longer exists in the compiled config", async () => {
  const interpret = createInterpreter(alwaysLowConfidenceFallback, createInMemoryRepository());
  const result = await interpret(compiled, "SOME_REMOVED_STATE", "wa-1", replyMessage("anything"), TEST_CONTEXT);
  assert.equal(result.nextState, "ROOT");
});
