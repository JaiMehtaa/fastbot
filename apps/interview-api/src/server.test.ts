import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./server.js";

test("GET /health returns ok", async () => {
  const app = createServer();
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("POST /interview/turn requires draftSessionId and text", async () => {
  const app = createServer();
  const response = await app.inject({ method: "POST", url: "/interview/turn", payload: {} });
  assert.equal(response.statusCode, 400);
});

test("POST /interview/turn runs createServer()'s zero-config defaults (heuristic classify/extract, in-memory store) end to end", async () => {
  const app = createServer();

  const first = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId: "http-demo-1", text: "I sell handmade soaps online, minimal support is fine" },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().done, false);
});

test("POST /interview/turn persists state across turns via the session store, keyed by draftSessionId", async () => {
  const app = createServer();
  const draftSessionId = "http-demo-2";

  const first = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId, text: "I run a soap shop, minimal support" },
  });
  const lobKeyAfterFirst = first.json().state.lobKey;
  assert.ok(lobKeyAfterFirst);

  const second = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId, text: "We're called Meadow Soaps" },
  });

  // the LOB decided in turn 1 must still be set in turn 2 — proves the
  // session store round-trips state through the HTTP layer, not just
  // within a single in-process call
  assert.equal(second.json().state.lobKey, lobKeyAfterFirst);
});
