import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAiClientError, createOpenAiClient } from "./openai-client.js";

test("createOpenAiClient fails loudly at construction time when no API key is available", () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.throws(() => createOpenAiClient(), OpenAiClientError);
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});

test("createOpenAiClient accepts an explicitly passed apiKey without touching env", () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.doesNotThrow(() => createOpenAiClient({ apiKey: "test-key" }));
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});
