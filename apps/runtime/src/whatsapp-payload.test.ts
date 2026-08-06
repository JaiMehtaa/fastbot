import { test } from "node:test";
import assert from "node:assert/strict";
import { buildButtonMessage, buildListMessage } from "./whatsapp-payload.js";

test("buildListMessage truncates row titles/descriptions and header/body/footer to WhatsApp's real limits", () => {
  const longTitle = "A".repeat(200);
  const longDescription = "B".repeat(200);
  const message = buildListMessage("wa-1", "C".repeat(200), "D".repeat(2000), "E".repeat(200), "F".repeat(200), [
    { id: "row-1", title: longTitle, description: longDescription },
  ]);

  const row = message.interactive.action.sections[0]?.rows[0];
  assert.ok(row);
  assert.ok(row!.title.length <= 24);
  assert.ok(row!.description!.length <= 72);
  assert.equal(row!.id, "row-1"); // ids are never truncated
  assert.ok(message.interactive.header!.text.length <= 60);
  assert.ok(message.interactive.body.text.length <= 1024);
  assert.ok(message.interactive.footer!.text.length <= 60);
  assert.ok(message.interactive.action.button.length <= 20);
  assert.ok(message.interactive.action.sections[0]!.title.length <= 24);
});

test("buildListMessage leaves short text completely untouched", () => {
  const message = buildListMessage("wa-1", "Header", "Body", "Footer", "Choose", [{ id: "row-1", title: "Short" }]);
  assert.equal(message.interactive.header!.text, "Header");
  assert.equal(message.interactive.body.text, "Body");
  assert.equal(message.interactive.action.sections[0]?.rows[0]?.title, "Short");
});

test("buildButtonMessage truncates header/body/button titles to WhatsApp's real limits", () => {
  const message = buildButtonMessage("wa-1", "H".repeat(200), "I".repeat(2000), [{ id: "btn-1", title: "J".repeat(200) }]);
  assert.ok(message.interactive.header!.text.length <= 60);
  assert.ok(message.interactive.body.text.length <= 1024);
  assert.ok(message.interactive.action.buttons[0]!.reply.title.length <= 20);
  assert.equal(message.interactive.action.buttons[0]!.reply.id, "btn-1");
});
