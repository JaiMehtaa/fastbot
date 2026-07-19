import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterClientError, createOpenRouterClient } from "./openrouter-client.js";

test("createOpenRouterClient fails loudly at construction time when no API key is available", () => {
  const original = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    assert.throws(() => createOpenRouterClient(), OpenRouterClientError);
  } finally {
    if (original !== undefined) process.env.OPENROUTER_API_KEY = original;
  }
});

test("createOpenRouterClient accepts an explicitly passed apiKey without touching env", () => {
  const original = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    assert.doesNotThrow(() => createOpenRouterClient({ apiKey: "test-key" }));
  } finally {
    if (original !== undefined) process.env.OPENROUTER_API_KEY = original;
  }
});
