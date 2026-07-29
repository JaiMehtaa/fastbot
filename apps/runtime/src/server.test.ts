import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { createMockBspAdapter } from "./bsp-adapter.js";
import { createInterpreter } from "./interpreter.js";
import { createInMemoryRepository } from "./repository.js";
import { createServer, type ServerDeps } from "./server.js";

function minimalDraft(): DraftConfig {
  return {
    draftSessionId: "server-test",
    version: 1,
    lobKey: "minimal_support",
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: {
      business_info: { business_name: "Meadow Soaps", description: "Handmade soaps.", hours: { mon_fri: "9-18" } },
      faq_support: { faqs: [{ question: "Vegan?", answer: "Yes." }] },
      human_escalation: { escalation_prompt: "We'll reach out." },
    },
  };
}

function makeDeps(): ServerDeps {
  return {
    repository: createInMemoryRepository(),
    bspAdapter: createMockBspAdapter(),
    interpret: createInterpreter(async () => null),
    sandboxPhoneNumberId: "sandbox-number",
    sandboxWhatsAppNumber: "911234567890",
  };
}

test("GET /health returns ok", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("POST /webhook processes an inbound message for a known tenant", async () => {
  const deps = makeDeps();
  (deps.repository as ReturnType<typeof createInMemoryRepository>).tenantsByPhoneNumberId.set("948385815035482", {
    tenantId: "tenant-1",
    compiledConfig: compile(minimalDraft()),
  });
  const app = createServer(deps);

  const response = await app.inject({
    method: "POST",
    url: "/webhook",
    payload: {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "948385815035482" },
                messages: [{ from: "919999999999", id: "wamid.1", type: "text", text: { body: "hi" } }],
              },
            },
          ],
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "processed" });
});

test("POST /webhook returns ignored for a malformed body", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({ method: "POST", url: "/webhook", payload: {} });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ignored" });
});

test("POST /webhook updates chat_history status by message id for a status webhook", async () => {
  const deps = makeDeps();
  await deps.repository.insertChatHistory({
    contextType: "tenant",
    contextId: "tenant-1",
    waId: "919999999999",
    messageId: "wamid.1",
    direction: "outbound",
    payload: {},
    status: "sent",
  });
  const app = createServer(deps);

  const response = await app.inject({
    method: "POST",
    url: "/webhook",
    payload: {
      entry: [
        {
          changes: [
            { value: { metadata: { phone_number_id: "948385815035482" }, statuses: [{ id: "wamid.1", status: "delivered" }] } },
          ],
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  const entry = (deps.repository as ReturnType<typeof createInMemoryRepository>).chatHistory[0];
  assert.equal(entry?.status, "delivered");
});

test("POST /sandbox/issue returns a token and wa.me joinUrl for a valid draft", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({ method: "POST", url: "/sandbox/issue", payload: { draft: minimalDraft() } });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.ok(body.token);
  assert.match(body.joinUrl, /^https:\/\/wa\.me\/911234567890\?text=/);
});

test("POST /sandbox/issue returns 422 for an invalid draft rather than issuing a token", async () => {
  const app = createServer(makeDeps());
  const invalidDraft: DraftConfig = {
    draftSessionId: "invalid",
    version: 1,
    lobKey: "minimal_support",
    selectedPrimitives: ["business_info", "faq_support", "human_escalation"],
    fieldValues: { business_info: { business_name: "Meadow Soaps" } },
  };
  const response = await app.inject({ method: "POST", url: "/sandbox/issue", payload: { draft: invalidDraft } });
  assert.equal(response.statusCode, 422);
});

test("POST /sandbox/issue requires a draft in the body", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({ method: "POST", url: "/sandbox/issue", payload: {} });
  assert.equal(response.statusCode, 400);
});

test("POST /preview/message returns the bot's reply directly, without touching the configured bspAdapter", async () => {
  const deps = makeDeps();
  (deps.repository as ReturnType<typeof createInMemoryRepository>).tenantsByPhoneNumberId.set("948385815035482", {
    tenantId: "tenant-1",
    compiledConfig: compile(minimalDraft()),
  });
  const app = createServer(deps);

  const response = await app.inject({
    method: "POST",
    url: "/preview/message",
    payload: {
      phoneNumberId: "948385815035482",
      message: { waId: "919999999999", messageId: "m1", type: "text", text: "hi", receivedAt: new Date().toISOString() },
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, "processed");
  assert.equal(body.sentMessages.length, 1);
  assert.match(body.sentMessages[0].interactive.header.text, /Meadow Soaps/i);
  // the configured (real, non-preview) bspAdapter never saw this traffic
  assert.equal((deps.bspAdapter as ReturnType<typeof createMockBspAdapter>).sentMessages.length, 0);
});

test("POST /preview/message succeeds on a second request to the same tenant, and each response is scoped to only its own new message", async () => {
  // Regression test: the preview mock adapter is shared server-lifetime, not
  // recreated per request — a fresh one each time reset its messageId
  // counter to 1, colliding with chat_history's real (context_type,
  // context_id, message_id) uniqueness constraint on the second message
  // ever sent to the same tenant. createInMemoryRepository() doesn't
  // enforce that constraint, so this doesn't reproduce the original 500 —
  // it proves the response-slicing logic (no accumulation across requests);
  // the fix itself was verified live against real Postgres separately.
  const deps = makeDeps();
  (deps.repository as ReturnType<typeof createInMemoryRepository>).tenantsByPhoneNumberId.set("948385815035482", {
    tenantId: "tenant-1",
    compiledConfig: compile(minimalDraft()),
  });
  const app = createServer(deps);

  const first = await app.inject({
    method: "POST",
    url: "/preview/message",
    payload: { phoneNumberId: "948385815035482", message: { waId: "919999999999", messageId: "m1", type: "text", text: "hi", receivedAt: new Date().toISOString() } },
  });
  const second = await app.inject({
    method: "POST",
    url: "/preview/message",
    payload: { phoneNumberId: "948385815035482", message: { waId: "919999999999", messageId: "m2", type: "text", text: "hi", receivedAt: new Date().toISOString() } },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  const firstBody = first.json();
  const secondBody = second.json();
  assert.equal(firstBody.sentMessages.length, 1);
  assert.equal(secondBody.sentMessages.length, 1);
  // both responses only contain that request's own new message, not an accumulating history
});

test("POST /preview/message requires phoneNumberId and message", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({ method: "POST", url: "/preview/message", payload: {} });
  assert.equal(response.statusCode, 400);
});
