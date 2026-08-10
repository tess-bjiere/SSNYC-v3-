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
  latestSample,
  sampleEta,
  materialSummary,
  hasLegacyMaterialDates,
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

// ---------------------------------------------------------------------------
// The refinement (P3 refinements): the sample's own ETA, materials in words
// rather than dates, and the four retired date columns still holding history.
// ---------------------------------------------------------------------------

test("the factory leg is named for the sample, not for the paperwork", () => {
  // "Submitted" and "received" on their own read as being about anything —
  // the material, the tech pack, a comment. They are about the sample.
  const t = sampleTimeline(s({ submitted_date: "2027-02-22", received_date: "2027-03-14" }));
  assert.deepEqual(t.map((x) => x.label), ["Sample requested", "Sample received"]);
});

test("an expected sample sits between submitted and received in the timeline", () => {
  const t = sampleTimeline(s({ submitted_date: "2027-02-22", eta_date: "2027-03-10" }));
  assert.deepEqual(t.map((x) => x.key), ["submitted", "eta_sample"]);
  assert.equal(t[1].label, "Sample due");
  assert.equal(t[1].date, "10 Mar 27");
});

test("once the sample is in, its ETA stops being shown", () => {
  // Two dates side by side only invite the question "so which is it?".
  const t = sampleTimeline(
    s({ submitted_date: "2027-02-22", eta_date: "2027-03-10", received_date: "2027-03-14" })
  );
  assert.deepEqual(t.map((x) => x.key), ["submitted", "received"]);
});

test("sampleEta: nothing promised and nothing arrived says nothing", () => {
  const e = sampleEta(s({ submitted_date: "2027-02-22" }), "2027-03-01");
  assert.equal(e.state, "none");
  assert.equal(e.label, "");
  assert.equal(e.days, null);
});

test("sampleEta: an ETA in the future is due, with the days remaining", () => {
  const e = sampleEta(s({ eta_date: "2027-03-10" }), "2027-03-01");
  assert.equal(e.state, "due");
  assert.equal(e.days, 9);
  assert.equal(e.label, "ETA 10 Mar 27");
});

test("sampleEta: the ETA day itself is not yet overdue, and never says -0", () => {
  const e = sampleEta(s({ eta_date: "2027-03-10" }), "2027-03-10");
  assert.equal(e.state, "due");
  assert.equal(e.days, 0);
  assert.equal(Object.is(e.days, -0), false);
});

test("sampleEta: a date that has passed is overdue, in days, singular at one", () => {
  const late = sampleEta(s({ eta_date: "2027-03-10" }), "2027-03-17");
  assert.equal(late.state, "late");
  assert.equal(late.days, 7);
  assert.equal(late.label, "7 days overdue");

  const one = sampleEta(s({ eta_date: "2027-03-10" }), "2027-03-11");
  assert.equal(one.label, "1 day overdue");
});

test("sampleEta: arrival ends the question, however late it was", () => {
  const e = sampleEta(s({ eta_date: "2027-03-10", received_date: "2027-03-20" }), "2027-04-01");
  assert.equal(e.state, "landed");
  assert.equal(e.label, "In 20 Mar 27");
  assert.equal(e.days, null);
});

test("sampleEta: an unparseable date is ignored rather than shown broken", () => {
  assert.equal(sampleEta(s({ eta_date: "next week" }), "2027-03-01").state, "none");
  // No usable "today" still shows the promise, just not how far off it is.
  const noToday = sampleEta(s({ eta_date: "2027-03-10" }), "whenever");
  assert.equal(noToday.state, "due");
  assert.equal(noToday.days, null);
  assert.equal(noToday.label, "ETA 10 Mar 27");
});

test("the material line is what it is, what it is made of, and who supplies it", () => {
  assert.equal(
    materialSummary(
      s({
        material_type: "Cotton jersey",
        material_contents: "94% cotton, 6% elastane",
        material_supplier: "Toyoshima",
      })
    ),
    "Cotton jersey · 94% cotton, 6% elastane · Toyoshima"
  );
});

test("the material line skips what has not been said instead of printing dashes", () => {
  assert.equal(materialSummary(s()), "");
  assert.equal(materialSummary(s({ material_type: "  ", material_supplier: "  " })), "");
  assert.equal(materialSummary(s({ material_supplier: "Toyoshima" })), "Toyoshima");
  assert.equal(
    materialSummary(s({ material_type: "  Cotton jersey  ", material_contents: "100% cotton" })),
    "Cotton jersey · 100% cotton"
  );
});

test("a round that still holds a retired material date is flagged as history", () => {
  // The columns were kept and the inputs were removed — the right way round,
  // but it means a date can exist that no form will ever show again.
  assert.equal(hasLegacyMaterialDates(s()), false);
  assert.equal(hasLegacyMaterialDates(s({ material_notes: "Dye lot 4412." })), false);
  assert.equal(hasLegacyMaterialDates(s({ material_ordered_date: "2027-01-05" })), true);
  assert.equal(hasLegacyMaterialDates(s({ material_eta_date: "2027-01-20" })), true);
  assert.equal(hasLegacyMaterialDates(s({ material_received_date: "2027-01-26" })), true);
  // Rubbish in the column is not history worth printing.
  assert.equal(hasLegacyMaterialDates(s({ material_ordered_date: "sometime" })), false);
});

test("removing the material date inputs did not remove the dates from the screen", () => {
  const legacy = s({
    material_ordered_date: "2027-01-05",
    material_eta_date: "2027-01-20",
    material_received_date: "2027-01-26",
    submitted_date: "2027-02-22",
  });
  assert.deepEqual(sampleTimeline(legacy).map((x) => x.key), [
    "ordered",
    "eta",
    "material_in",
    "submitted",
  ]);
  // And the old material status still reads, so the by-factory view is intact.
  assert.equal(materialStatus(legacy, "2027-03-01").state, "received");
});

// ---------------------------------------------------------------------------
// Which round the profile opens on (Tess, 2026-08-05: "when someone opens the
// profile the latest sample round should be showing").
// ---------------------------------------------------------------------------

const ORDER = ["proto1", "proto2", "proto3", "sms", "pps1", "pps2", "bulk"];

test("the latest round is the furthest through the cycle, not the last one typed", () => {
  // The PPS was logged first; the 1st proto was backfilled afterwards. The
  // style is on the PPS, and a profile that opened on the proto because it was
  // typed most recently would be lying about where the style stands.
  const rows = [
    { round: "pps1", created_at: "2027-01-01T00:00:00Z" },
    { round: "proto1", created_at: "2027-02-01T00:00:00Z" },
  ];
  assert.equal(latestSample(rows, ORDER)?.round, "pps1");
});

test("two rows on the same round fall back to the one entered later", () => {
  const rows = [
    { round: "proto2", created_at: "2027-01-01T00:00:00Z" },
    { round: "proto2", created_at: "2027-03-01T00:00:00Z" },
  ];
  assert.equal(latestSample(rows, ORDER)?.created_at, "2027-03-01T00:00:00Z");
});

test("a round the cycle does not name still sorts last rather than vanishing", () => {
  // roundRank puts an unknown round at the end. That is deliberate: a round
  // somebody invented is still a round, and the profile must be able to open
  // on it.
  const rows = [{ round: "proto1" }, { round: "wearer trial" }];
  assert.equal(latestSample(rows, ORDER)?.round, "wearer trial");
});

test("no rounds is a real answer, not an empty card", () => {
  assert.equal(latestSample([], ORDER), null);
});
