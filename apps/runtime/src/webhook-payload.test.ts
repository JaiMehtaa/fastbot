import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWebhookPayload, type MetaWebhookBody } from "./webhook-payload.js";

test("parseWebhookPayload extracts a text message", () => {
  const body: MetaWebhookBody = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "948385815035482" },
              contacts: [{ profile: { name: "Priya" } }],
              messages: [{ from: "919999999999", id: "wamid.abc", timestamp: "1700000000", type: "text", text: { body: "Hi" } }],
            },
          },
        ],
      },
    ],
  };

  const result = parseWebhookPayload(body);
  assert.equal(result.kind, "message");
  assert.equal(result.kind === "message" && result.phoneNumberId, "948385815035482");
  assert.equal(result.kind === "message" && result.message.text, "Hi");
  assert.equal(result.kind === "message" && result.message.waId, "919999999999");
  assert.equal(result.kind === "message" && result.contactName, "Priya");
});

test("parseWebhookPayload extracts an interactive list_reply's id", () => {
  const body: MetaWebhookBody = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "948385815035482" },
              messages: [
                {
                  from: "919999999999",
                  id: "wamid.abc",
                  type: "interactive",
                  interactive: { list_reply: { id: "root_catalogue", title: "Browse Products" } },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = parseWebhookPayload(body);
  assert.equal(result.kind === "message" && result.message.interactiveReplyId, "root_catalogue");
});

test("parseWebhookPayload extracts a status update", () => {
  const body: MetaWebhookBody = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "948385815035482" },
              statuses: [{ id: "wamid.abc", status: "delivered" }],
            },
          },
        ],
      },
    ],
  };

  const result = parseWebhookPayload(body);
  assert.deepEqual(result, { kind: "status", phoneNumberId: "948385815035482", messageId: "wamid.abc", status: "delivered" });
});

test("parseWebhookPayload ignores an empty or malformed body", () => {
  assert.deepEqual(parseWebhookPayload({}), { kind: "ignored" });
  assert.deepEqual(parseWebhookPayload({ entry: [{ changes: [{ value: {} }] }] }), { kind: "ignored" });
});
