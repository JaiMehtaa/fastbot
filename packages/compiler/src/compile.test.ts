import { test } from "node:test";
import assert from "node:assert/strict";
import type { StateTableEntry } from "@whatsapp-bot-platform/shared-types";
import { assignStateTableEntry } from "./compile.js";

test("assignStateTableEntry sets a fresh state", () => {
  const stateTable: Record<string, StateTableEntry> = {};
  assignStateTableEntry(stateTable, "FAQ_MENU", "faq_support", { foo: "bar" });
  assert.deepEqual(stateTable.FAQ_MENU, { primitiveKey: "faq_support", handlerArgs: { foo: "bar" } });
});

test("assignStateTableEntry allows the same primitive to re-assign its own state", () => {
  const stateTable: Record<string, StateTableEntry> = {};
  assignStateTableEntry(stateTable, "FAQ_MENU", "faq_support", { a: 1 });
  assert.doesNotThrow(() => assignStateTableEntry(stateTable, "FAQ_MENU", "faq_support", { a: 2 }));
  assert.deepEqual(stateTable.FAQ_MENU?.handlerArgs, { a: 2 });
});

test("assignStateTableEntry throws when a different primitive claims an already-owned state", () => {
  const stateTable: Record<string, StateTableEntry> = {};
  assignStateTableEntry(stateTable, "CATALOGUE_LIST", "catalogue", {});
  assert.throws(
    () => assignStateTableEntry(stateTable, "CATALOGUE_LIST", "lead_capture", {}),
    /claimed by both "catalogue" and "lead_capture"/,
  );
});
