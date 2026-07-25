import { test } from "node:test";
import assert from "node:assert/strict";
import { ThreeSixtyDialogError, createThreeSixtyDialogAdapter } from "./three-sixty-dialog-adapter.js";
import { buildButtonMessage } from "./whatsapp-payload.js";

const SAMPLE_MESSAGE = buildButtonMessage("919999999999", "Hi", "How can we help?", [{ id: "a", title: "A" }]);

function fakeFetch(response: { ok: boolean; status?: number; body: unknown }): typeof fetch {
  return (async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    text: async () => JSON.stringify(response.body),
    json: async () => response.body,
  })) as unknown as typeof fetch;
}

test("fails at construction time when no API key is available", () => {
  const original = process.env.THREE_SIXTY_DIALOG_API_KEY;
  delete process.env.THREE_SIXTY_DIALOG_API_KEY;
  try {
    assert.throws(() => createThreeSixtyDialogAdapter(), ThreeSixtyDialogError);
  } finally {
    if (original !== undefined) process.env.THREE_SIXTY_DIALOG_API_KEY = original;
  }
});

test("sends the outbound message unchanged and returns the message id from the response", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return { ok: true, status: 200, text: async () => "", json: async () => ({ messages: [{ id: "wamid.abc123" }] }) };
  }) as unknown as typeof fetch;

  const adapter = createThreeSixtyDialogAdapter({ apiKey: "test-key", fetchImpl });
  const result = await adapter.send(SAMPLE_MESSAGE);

  assert.equal(result.messageId, "wamid.abc123");
  assert.match(capturedUrl ?? "", /\/messages$/);
  assert.equal((capturedInit?.headers as Record<string, string>)["D360-API-KEY"], "test-key");
  assert.deepEqual(JSON.parse(capturedInit?.body as string), SAMPLE_MESSAGE);
});

test("throws ThreeSixtyDialogError on a non-ok response", async () => {
  const adapter = createThreeSixtyDialogAdapter({
    apiKey: "test-key",
    fetchImpl: fakeFetch({ ok: false, status: 401, body: { error: "unauthorized" } }),
  });
  await assert.rejects(() => adapter.send(SAMPLE_MESSAGE), ThreeSixtyDialogError);
});

test("throws ThreeSixtyDialogError when the response is missing a message id", async () => {
  const adapter = createThreeSixtyDialogAdapter({
    apiKey: "test-key",
    fetchImpl: fakeFetch({ ok: true, body: {} }),
  });
  await assert.rejects(() => adapter.send(SAMPLE_MESSAGE), ThreeSixtyDialogError);
});
