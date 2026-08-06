import { test } from "node:test";
import assert from "node:assert/strict";
import { expandBusinessHours } from "./hours.js";

test("expands mon_fri/sat/sun grouped-range keys into per-day entries", () => {
  const expanded = expandBusinessHours({ mon_fri: "9:00-18:00", sat: "9:00-14:00", sun: "closed" });
  assert.equal(expanded.monday, "9:00-18:00");
  assert.equal(expanded.tuesday, "9:00-18:00");
  assert.equal(expanded.wednesday, "9:00-18:00");
  assert.equal(expanded.thursday, "9:00-18:00");
  assert.equal(expanded.friday, "9:00-18:00");
  assert.equal(expanded.saturday, "9:00-14:00");
  assert.equal(expanded.sunday, "closed");
});

test("passes full day names through unchanged", () => {
  const expanded = expandBusinessHours({ monday: "9-5", tuesday: "9-5" });
  assert.equal(expanded.monday, "9-5");
  assert.equal(expanded.tuesday, "9-5");
  assert.equal(Object.keys(expanded).length, 2);
});

test("expands 3-letter day abbreviations", () => {
  const expanded = expandBusinessHours({ mon: "9-5", sat: "10-2" });
  assert.equal(expanded.monday, "9-5");
  assert.equal(expanded.saturday, "10-2");
});

test("expands weekday/weekend/daily collective keys", () => {
  const weekdays = expandBusinessHours({ weekdays: "9-5", weekend: "closed" });
  assert.equal(weekdays.monday, "9-5");
  assert.equal(weekdays.friday, "9-5");
  assert.equal(weekdays.saturday, "closed");
  assert.equal(weekdays.sunday, "closed");

  const daily = expandBusinessHours({ daily: "24 hours" });
  assert.equal(daily.monday, "24 hours");
  assert.equal(daily.sunday, "24 hours");
});

test("handles a range key that wraps past sunday", () => {
  const expanded = expandBusinessHours({ fri_mon: "10-2" });
  assert.equal(expanded.friday, "10-2");
  assert.equal(expanded.saturday, "10-2");
  assert.equal(expanded.sunday, "10-2");
  assert.equal(expanded.monday, "10-2");
  assert.equal(expanded.tuesday, undefined);
});

test("ignores an unrecognized key like a free-text 'note' rather than crashing", () => {
  const expanded = expandBusinessHours({ note: "open by appointment only" });
  assert.deepEqual(expanded, {});
});

test("is case-insensitive on keys", () => {
  const expanded = expandBusinessHours({ MON_FRI: "9-5" });
  assert.equal(expanded.monday, "9-5");
});

test("an empty hours object expands to an empty object", () => {
  assert.deepEqual(expandBusinessHours({}), {});
});
