import { test } from "node:test";
import assert from "node:assert/strict";
import { DbClientError, createDbClient } from "./client.js";

test("createDbClient fails loudly when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => createDbClient(), DbClientError);
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("createDbClient accepts explicitly passed url/serviceKey without touching env", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.doesNotThrow(() =>
      createDbClient({ url: "https://example.supabase.co", serviceKey: "test-service-key" }),
    );
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
