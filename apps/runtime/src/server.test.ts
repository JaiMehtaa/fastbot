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
  const repository = createInMemoryRepository();
  return {
    repository,
    bspAdapter: createMockBspAdapter(),
    interpret: createInterpreter(async () => null, repository),
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
  // Each /preview/message request gets its own fresh mock BSP adapter
  // (bsp-adapter.ts's messageId is a random UUID, not a counter that needs
  // to keep incrementing across requests — no chat_history collision risk),
  // so responses never accumulate across requests to the same tenant.
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

test("POST /preview/message doesn't leak one concurrent request's outbound message into another's response", async () => {
  // Regression test: a shared, server-lifetime mock BSP adapter with
  // before/after-length response slicing isn't request-isolated under real
  // concurrency — two genuinely simultaneous requests could each read a
  // slice containing the OTHER request's outbound message (found live via
  // QA testing: two customers tapping the same booking slot at once each
  // saw both replies). Fired without awaiting between them, so both are
  // genuinely in flight together.
  const deps = makeDeps();
  (deps.repository as ReturnType<typeof createInMemoryRepository>).tenantsByPhoneNumberId.set("948385815035482", {
    tenantId: "tenant-1",
    compiledConfig: compile(minimalDraft()),
  });
  const app = createServer(deps);

  const [first, second] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/preview/message",
      payload: { phoneNumberId: "948385815035482", message: { waId: "wa-a", messageId: "concurrent-a", type: "text", text: "hi", receivedAt: new Date().toISOString() } },
    }),
    app.inject({
      method: "POST",
      url: "/preview/message",
      payload: { phoneNumberId: "948385815035482", message: { waId: "wa-b", messageId: "concurrent-b", type: "text", text: "hi", receivedAt: new Date().toISOString() } },
    }),
  ]);

  assert.equal(first.json().sentMessages.length, 1);
  assert.equal(second.json().sentMessages.length, 1);
  assert.equal(first.json().sentMessages[0].to, "wa-a");
  assert.equal(second.json().sentMessages[0].to, "wa-b");
});

test("POST /preview/message requires phoneNumberId and message", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({ method: "POST", url: "/preview/message", payload: {} });
  assert.equal(response.statusCode, 400);
});

test("POST /preview/message rejects a message missing messageId with a clean 400, not a raw DB error", async () => {
  // Regression test: found live by an automated test round — a missing
  // messageId/waId used to reach insertChatHistory() and come back as a raw
  // Postgres "null value in column ... violates not-null constraint" 500.
  const app = createServer(makeDeps());
  const response = await app.inject({
    method: "POST",
    url: "/preview/message",
    payload: { phoneNumberId: "948385815035482", message: { waId: "919999999999", type: "text", text: "hi", receivedAt: new Date().toISOString() } },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /messageId/);
});

test("POST /preview/message rejects an empty message object with a clean 400", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({ method: "POST", url: "/preview/message", payload: { phoneNumberId: "948385815035482", message: {} } });
  assert.equal(response.statusCode, 400);
});

test("POST /preview/message rejects an invalid message.type", async () => {
  const app = createServer(makeDeps());
  const response = await app.inject({
    method: "POST",
    url: "/preview/message",
    payload: {
      phoneNumberId: "948385815035482",
      message: { waId: "919999999999", messageId: "m1", type: "carrier_pigeon", receivedAt: new Date().toISOString() },
    },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /message\.type/);
});
