import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

test("POST /interview/turn rejects a non-UUID draftSessionId", async () => {
  const app = createServer();
  const response = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId: "not-a-uuid", text: "hello" },
  });
  assert.equal(response.statusCode, 400);
});

test("POST /interview/turn runs createServer()'s zero-config defaults (heuristic classify/extract, in-memory store) end to end", async () => {
  const app = createServer();

  const first = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId: randomUUID(), text: "I'm Jai, reach me at jai@example.com" },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().done, false);
});

test("POST /interview/turn persists state across turns via the session store, keyed by draftSessionId", async () => {
  const app = createServer();
  const draftSessionId = randomUUID();

  // turn 1: owner_info — asks for name/contact, doesn't reach capability detection yet
  const first = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId, text: "I'm Jai, reach me at jai@example.com" },
  });
  assert.equal(first.json().state.interviewStage, "detecting");
  assert.equal(first.json().state.ownerName, "Jai");

  // turn 2: capability detection — asks the "anything else?" catch-all, doesn't lock yet.
  // Proves owner info from turn 1 round-tripped through the session store, not just an in-process call.
  const second = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId, text: "I run a soap shop, minimal support" },
  });
  assert.equal(second.json().state.interviewStage, "awaiting_more");
  assert.equal(second.json().state.lobKey, null);
  assert.equal(second.json().state.ownerName, "Jai");

  // turn 3: declines the catch-all — locks selectedPrimitives/lobKey, moves to the website step.
  const third = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId, text: "no that's everything" },
  });
  const lobKeyAfterLock = third.json().state.lobKey;
  assert.ok(lobKeyAfterLock);
  assert.equal(third.json().state.interviewStage, "awaiting_website");

  // turn 4: declines the website — reaches the missing-field loop.
  const fourth = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId, text: "no website" },
  });
  assert.equal(fourth.json().state.interviewStage, "locked");

  const fifth = await app.inject({
    method: "POST",
    url: "/interview/turn",
    payload: { draftSessionId, text: "We're called Meadow Soaps" },
  });

  // the lobKey decided in turn 3 must still be set in turn 5 — proves the session store
  // round-trips the locked draft through the HTTP layer across many hops
  assert.equal(fifth.json().state.lobKey, lobKeyAfterLock);
});
