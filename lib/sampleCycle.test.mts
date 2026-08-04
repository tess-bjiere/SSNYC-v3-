import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayNumber,
  daysBetween,
  shortDate,
  materialStatus,
  materialLeadDays,
  factoryLeadDays,
  sampleState,
  SAMPLE_STATE_LABELS,
  sampleTimeline,
  roundRank,
  sortSamples,
  type SampleLike,
} from "./sampleCycle.ts";

function s(over: Partial<SampleLike> = {}): SampleLike {
  return { round: "proto1", factory: "Jiaxing", ...over };
}

test("dayNumber accepts a Postgres date and rejects anything else", () => {
  assert.equal(typeof dayNumber("2027-03-12"), "number");
  assert.equal(dayNumber(null), null);
  assert.equal(dayNumber(undefined), null);
  assert.equal(dayNumber(""), null);
  assert.equal(dayNumber("12/03/2027"), null);
  assert.equal(dayNumber("2027-03-12T00:00:00Z"), null);
});

test("dayNumber rejects days that do not exist rather than rolling forward", () => {
  assert.equal(dayNumber("2027-02-30"), null);
  assert.equal(dayNumber("2027-04-31"), null);
  assert.equal(dayNumber("2027-13-01"), null);
  // 2028 is a leap year, 2027 is not.
  assert.notEqual(dayNumber("2028-02-29"), null);
  assert.equal(dayNumber("2027-02-29"), null);
});

test("daysBetween counts calendar days and can go backwards", () => {
  assert.equal(daysBetween("2027-03-01", "2027-03-12"), 11);
  assert.equal(daysBetween("2027-03-12", "2027-03-01"), -11);
  assert.equal(daysBetween("2027-03-12", "2027-03-12"), 0);
  // Across a month boundary and across a leap day.
  assert.equal(daysBetween("2027-01-31", "2027-02-01"), 1);
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2);
  assert.equal(daysBetween("2027-03-01", null), null);
});

test("shortDate is readable and leaves anything unparseable alone", () => {
  assert.equal(shortDate("2027-03-12"), "12 Mar 27");
  assert.equal(shortDate("2027-12-01"), "1 Dec 27");
  assert.equal(shortDate(null), "");
  assert.equal(shortDate("sometime in March"), "sometime in March");
});

test("material status: nothing recorded is silent, not a warning", () => {
  const m = materialStatus(s(), "2027-03-12");
  assert.equal(m.state, "none");
  assert.equal(m.label, "");
});

test("material status: received wins over every other date", () => {
  const m = materialStatus(
    s({
      material_ordered_date: "2027-01-05",
      material_eta_date: "2027-02-01",
      material_received_date: "2027-02-20",
    }),
    "2027-03-12"
  );
  assert.equal(m.state, "received");
  assert.match(m.label, /20 Feb 27/);
});

test("material status: an ETA in the future is due, in the past is late", () => {
  const due = materialStatus(s({ material_eta_date: "2027-03-20" }), "2027-03-12");
  assert.equal(due.state, "due");
  assert.equal(due.days, 8);

  const late = materialStatus(s({ material_eta_date: "2027-03-01" }), "2027-03-12");
  assert.equal(late.state, "late");
  assert.equal(late.days, 11);
  assert.equal(late.label, "Material 11 days late");
});

test("material status: the ETA day itself is not yet late", () => {
  const m = materialStatus(s({ material_eta_date: "2027-03-12" }), "2027-03-12");
  assert.equal(m.state, "due");
  assert.equal(m.days, 0);
});

test("material status: one day late says day, not days", () => {
  const m = materialStatus(s({ material_eta_date: "2027-03-11" }), "2027-03-12");
  assert.equal(m.label, "Material 1 day late");
});

test("material status: ordered with no ETA reads as ordered", () => {
  const m = materialStatus(s({ material_ordered_date: "2027-03-01" }), "2027-03-12");
  assert.equal(m.state, "ordered");
  assert.match(m.label, /1 Mar 27/);
});

test("lead times separate the supplier leg from the factory leg", () => {
  const row = s({
    material_ordered_date: "2027-01-05",
    material_received_date: "2027-02-20",
    submitted_date: "2027-02-22",
    received_date: "2027-03-15",
  });
  assert.equal(materialLeadDays(row), 46);
  assert.equal(factoryLeadDays(row), 21);
  assert.equal(materialLeadDays(s()), null);
  assert.equal(factoryLeadDays(s({ submitted_date: "2027-02-22" })), null);
});

test("sample state reads back-to-front so a half-filled row never overstates itself", () => {
  assert.equal(sampleState(s()), "planned");
  assert.equal(sampleState(s({ material_ordered_date: "2027-01-05" })), "material");
  assert.equal(sampleState(s({ material_received_date: "2027-02-20" })), "material");
  assert.equal(sampleState(s({ material_ordered_date: "2027-01-05", submitted_date: "2027-02-22" })), "at_factory");
  assert.equal(sampleState(s({ submitted_date: "2027-02-22", received_date: "2027-03-15" })), "received");
});

test("a garbage date does not advance the state", () => {
  assert.equal(sampleState(s({ received_date: "soon" })), "planned");
  assert.equal(sampleState(s({ submitted_date: "", received_date: null })), "planned");
});

test("every state has a label", () => {
  for (const k of ["planned", "material", "at_factory", "received"] as const) {
    assert.ok(SAMPLE_STATE_LABELS[k].length > 0);
  }
});

test("the timeline is ordered and skips whatever was not recorded", () => {
  const t = sampleTimeline(
    s({
      material_ordered_date: "2027-01-05",
      material_received_date: "2027-02-20",
      submitted_date: "2027-02-22",
    })
  );
  assert.deepEqual(t.map((x) => x.key), ["ordered", "material_in", "submitted"]);
  assert.equal(t[0].date, "5 Jan 27");
  assert.equal(t[0].label, "Material ordered");
});

test("an empty round has an empty timeline rather than a row of dashes", () => {
  assert.deepEqual(sampleTimeline(s()), []);
});

// ---------------------------------------------------------------------------
// Ordering. Found live: saving a round re-ordered the season, because three
// rounds seeded in one sitting share a created_at and Postgres is free to hand
// tied rows back in whatever order it likes — which changes after an UPDATE.
// ---------------------------------------------------------------------------

const ROUNDS = ["proto1", "proto2", "proto3", "sms", "pps1", "pps2", "bulk"];

test("roundRank follows the cycle and puts anything unknown last", () => {
  assert.equal(roundRank("proto1", ROUNDS), 0);
  assert.equal(roundRank("sms", ROUNDS), 3);
  assert.ok(roundRank("proto1", ROUNDS) < roundRank("proto2", ROUNDS));
  assert.equal(roundRank("  proto2  ", ROUNDS), 1);
  // A one-off round someone typed by hand sorts after the standard ones.
  assert.equal(roundRank("fit sample", ROUNDS), ROUNDS.length);
  assert.equal(roundRank(null, ROUNDS), ROUNDS.length);
  assert.equal(roundRank(undefined, ROUNDS), ROUNDS.length);
});

test("sortSamples reads in cycle order regardless of how the rows arrive", () => {
  const rows = [
    { round: "sms", created_at: "2026-08-04T10:00:00Z" },
    { round: "proto2", created_at: "2026-08-04T10:00:00Z" },
    { round: "proto1", created_at: "2026-08-04T10:00:00Z" },
  ];
  assert.deepEqual(sortSamples(rows, ROUNDS).map((r) => r.round), ["proto1", "proto2", "sms"]);
});

test("sortSamples breaks a tied rank on created_at", () => {
  const rows = [
    { round: "proto1", created_at: "2026-08-04T12:00:00Z" },
    { round: "proto1", created_at: "2026-08-01T09:00:00Z" },
  ];
  assert.deepEqual(
    sortSamples(rows, ROUNDS).map((r) => r.created_at),
    ["2026-08-01T09:00:00Z", "2026-08-04T12:00:00Z"]
  );
});

test("sortSamples is stable when rank and created_at both tie", () => {
  const rows = [
    { round: "bulk", created_at: "2026-08-04T10:00:00Z", id: "a" },
    { round: "bulk", created_at: "2026-08-04T10:00:00Z", id: "b" },
    { round: "bulk", created_at: "2026-08-04T10:00:00Z", id: "c" },
  ];
  assert.deepEqual(sortSamples(rows, ROUNDS).map((r) => r.id), ["a", "b", "c"]);
});

test("sortSamples leaves the caller's array alone", () => {
  const rows = [{ round: "sms" }, { round: "proto1" }];
  const out = sortSamples(rows, ROUNDS);
  assert.deepEqual(rows.map((r) => r.round), ["sms", "proto1"]);
  assert.notEqual(out, rows);
});

test("unknown rounds keep their own relative order at the end", () => {
  const rows = [
    { round: "toile", created_at: "2026-08-02T00:00:00Z" },
    { round: "proto1", created_at: "2026-08-09T00:00:00Z" },
    { round: "counter sample", created_at: "2026-08-01T00:00:00Z" },
  ];
  assert.deepEqual(sortSamples(rows, ROUNDS).map((r) => r.round), [
    "proto1",
    "counter sample",
    "toile",
  ]);
});
