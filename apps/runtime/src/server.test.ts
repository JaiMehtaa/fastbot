import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "@whatsapp-bot-platform/compiler";
import type { DraftConfig } from "@whatsapp-bot-platform/shared-types";
import { createMockBspAdapter } from "./bsp-adapter.js";
import { createInterpreter } from "./interpreter.js";
import { createInMemoryRepository } from "./repository.js";
import { createServer } from "./server.js";
import type { ProcessInboundMessageDeps } from "./process-inbound-message.js";

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

function makeDeps(): ProcessInboundMessageDeps {
  return {
    repository: createInMemoryRepository(),
    bspAdapter: createMockBspAdapter(),
    interpret: createInterpreter(async () => null),
    sandboxPhoneNumberId: "sandbox-number",
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
