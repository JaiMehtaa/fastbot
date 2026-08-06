import { test } from "node:test";
import assert from "node:assert/strict";
import { businessInfoHandler } from "./handlers/business-info.js";
import type { HandlerInput } from "./handlers/types.js";
import type { WhatsAppOutboundButtonMessage } from "./whatsapp-payload.js";

function input(handlerArgs: Record<string, unknown>): HandlerInput {
  return {
    waId: "wa-1",
    currentState: "BUSINESS_INFO_VIEW",
    message: { waId: "wa-1", messageId: "m-1", type: "text", text: "hi", receivedAt: new Date().toISOString() },
    stateEntry: { primitiveKey: "business_info", handlerArgs },
    context: { contextType: "tenant", contextId: "tenant-1" },
  };
}

test("renders grouped-range hours readably instead of raw JSON", async () => {
  const result = await businessInfoHandler(
    input({ business_name: "Meadow Soaps", hours: { mon_fri: "9:00-18:00", sat: "9:00-14:00", sun: "closed" } }),
  );
  const body = (result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text;
  assert.match(body, /Mon-Fri: 9:00-18:00/);
  assert.match(body, /Sat: 9:00-14:00/);
  assert.match(body, /Sun: closed/);
  assert.doesNotMatch(body, /\{/);
});

test("omits the hours line entirely when hours isn't set", async () => {
  const result = await businessInfoHandler(input({ business_name: "Meadow Soaps", description: "Handmade soaps." }));
  const body = (result.outboundPayload as WhatsAppOutboundButtonMessage).interactive.body.text;
  assert.doesNotMatch(body, /Hours/);
});
