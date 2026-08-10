import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEV_SORTS,
  DEV_SORT_IDS,
  DEFAULT_DEV_SORT,
  devSortId,
  devSortLabel,
  summarize,
  groupSamples,
  summarizeAll,
  sortStyles,
  type DevSampleLike,
  type DevStyleLike,
  type DevSummary,
} from "./devSort.ts";

// The real round order and labels, passed in the way the page passes them.
const ORDER = ["proto1", "proto2", "proto3", "sms", "pps1", "pps2", "bulk"];
const LABELS: Record<string, string> = {
  proto1: "1st Proto",
  proto2: "2nd Proto",
  proto3: "3rd Proto",
  sms: "SMS",
  pps1: "1st PPS",
  pps2: "2nd PPS",
  bulk: "Bulk",
};
const TODAY = "2026-08-04";

function style(over: Partial<DevStyleLike> & { id: string }): DevStyleLike {
  return { status: "development", evergreen: false, updated_at: "2026-08-03", ...over };
}
function sample(over: Partial<DevSampleLike> = {}): DevSampleLike {
  return { style_id: "s1", round: "proto1", created_at: "2026-06-01", ...over };
}
const sum = (st: DevStyleLike, rows: DevSampleLike[]) => summarize(st, rows, ORDER, LABELS, TODAY);

// ---------------------------------------------------------------------------
// The sort list itself
// ---------------------------------------------------------------------------

test("the sorts are the four workflow questions plus two plain orders, each with an id, a label and a hint", () => {
  // Four orders about where a style is in the cycle, then az/newest about where
  // it is in a list (Tess, 2026-08-09: "sort options wrong/short").
  assert.equal(DEV_SORTS.length, 6);
  assert.deepEqual(DEV_SORT_IDS, ["recent", "attention", "final", "fitting", "az", "newest"]);
  for (const s of DEV_SORTS) {
    assert.ok(s.label.length > 0);
    assert.ok(s.hint.length > 0);
  }
  assert.equal(DEFAULT_DEV_SORT, "recent");
});

test("a sort id from a url is either real or the default — never a throw", () => {
  assert.equal(devSortId("attention"), "attention");
  assert.equal(devSortId("  final  "), "final");
  assert.equal(devSortId("drop table"), DEFAULT_DEV_SORT);
  assert.equal(devSortId(null), DEFAULT_DEV_SORT);
  assert.equal(devSortId(undefined), DEFAULT_DEV_SORT);
  assert.equal(devSortLabel("fitting"), "Ready for fitting");
  assert.equal(devSortLabel("nonsense"), "Recent updates");
});

// ---------------------------------------------------------------------------
// Which round a style is "on"
// ---------------------------------------------------------------------------

test("the round is the furthest one logged, not the most recently typed", () => {
  // Somebody back-filling a missed 1st proto after the 2nd went out must not
  // move the style backwards on the board.
  const s = sum(style({ id: "s1" }), [
    sample({ round: "proto2", created_at: "2026-06-20" }),
    sample({ round: "proto1", created_at: "2026-07-01" }),
  ]);
  assert.equal(s.roundKey, "proto2");
  assert.equal(s.roundLabel, "2nd Proto");
});

test("a hand-typed round ranks last, but still shows when it is all there is", () => {
  const only = sum(style({ id: "s1" }), [sample({ round: "wearer trial" })]);
  assert.equal(only.roundKey, "wearer trial");
  assert.equal(only.roundLabel, "wearer trial"); // falls back to the raw key
  assert.equal(only.progress, 0); // unranked never reads as "nearly final"

  const beside = sum(style({ id: "s1" }), [
    sample({ round: "wearer trial", created_at: "2026-07-01" }),
    sample({ round: "proto1", created_at: "2026-06-01" }),
  ]);
  assert.equal(beside.roundKey, "proto1");
});

test("no rounds at all reads as empty rather than as round one", () => {
  const s = sum(style({ id: "s1" }), []);
  assert.equal(s.roundKey, "");
  assert.equal(s.roundLabel, "");
  assert.equal(s.progress, 0);
  assert.equal(s.etaState, "none");
  assert.equal(s.etaLabel, "");
});

// ---------------------------------------------------------------------------
// The ETA — the line Xander and the C-level read without opening anything
// ---------------------------------------------------------------------------

test("a sample that has arrived says so, and stops asking for an ETA", () => {
  const s = sum(style({ id: "s1" }), [
    sample({ round: "proto1", submitted_date: "2026-06-01", received_date: "2026-06-12", eta_date: "2026-06-10", fit_notes: "Body 2cm long." }),
  ]);
  assert.equal(s.etaState, "landed");
  assert.equal(s.etaLabel, "In 12 Jun 26");
  assert.equal(s.etaDays, null);
});

test("a promised date in the future is an ETA and asks for nothing", () => {
  const s = sum(style({ id: "s1" }), [
    sample({ round: "sms", submitted_date: "2026-07-20", eta_date: "2026-08-10" }),
  ]);
  assert.equal(s.etaState, "due");
  assert.equal(s.etaLabel, "ETA 10 Aug 26");
  assert.equal(s.etaDays, 6);
  assert.equal(s.attention, 0);
});

test("a sample due today is not late yet", () => {
  const s = sum(style({ id: "s1" }), [
    sample({ round: "sms", submitted_date: "2026-07-20", eta_date: TODAY }),
  ]);
  assert.equal(s.etaState, "due");
  assert.equal(s.etaDays, 0);
});

test("a date that has passed with nothing received is overdue, in days", () => {
  const s = sum(style({ id: "s1" }), [
    sample({ round: "sms", submitted_date: "2026-07-05", eta_date: "2026-07-28" }),
  ]);
  assert.equal(s.etaState, "late");
  assert.equal(s.etaDays, 7);
  assert.equal(s.etaLabel, "7 days overdue");
  assert.equal(s.attention, 1007);
  assert.equal(s.attentionLabel, "7 days overdue");
});

test("one day overdue is singular", () => {
  const s = sum(style({ id: "s1" }), [sample({ submitted_date: "2026-07-05", eta_date: "2026-08-03" })]);
  assert.equal(s.etaLabel, "1 day overdue");
});

test("a sample forgotten for years does not own the top of the list forever", () => {
  const s = sum(style({ id: "s1" }), [sample({ submitted_date: "2020-01-01", eta_date: "2020-02-01" })]);
  assert.equal(s.attention, 1365);
});

test("an unparseable date is ignored rather than rendered as a broken ETA", () => {
  const s = sum(style({ id: "s1" }), [sample({ submitted_date: "2026-07-05", eta_date: "soon" })]);
  assert.equal(s.etaState, "none");
  // No date at all while it sits at the factory is its own problem.
  assert.equal(s.attention, 300);
  assert.equal(s.attentionLabel, "At factory, no ETA");
});

// ---------------------------------------------------------------------------
// Attention — one number, so the sort and the chip cannot disagree
// ---------------------------------------------------------------------------

test("arrived and unfitted outranks at-the-factory, and both outrank nothing logged", () => {
  const waiting = sum(style({ id: "a" }), [sample({ submitted_date: "2026-07-01", received_date: "2026-07-20" })]);
  const atFactory = sum(style({ id: "b" }), [sample({ submitted_date: "2026-07-01" })]);
  const nothing = sum(style({ id: "c" }), []);

  assert.equal(waiting.attention, 500);
  assert.equal(waiting.attentionLabel, "Waiting to be fitted");
  assert.equal(atFactory.attention, 300);
  assert.equal(nothing.attention, 200);
  assert.equal(nothing.attentionLabel, "No rounds logged");
  assert.ok(waiting.attention > atFactory.attention);
  assert.ok(atFactory.attention > nothing.attention);
});

test("a fit note is what takes a sample off the rail", () => {
  // Not a status somebody has to remember to set — the rail fills up on its own
  // and empties when the note gets written.
  const before = sum(style({ id: "s1" }), [sample({ received_date: "2026-07-20" })]);
  const after = sum(style({ id: "s1" }), [sample({ received_date: "2026-07-20", fit_notes: "Shoulder 0.5cm wide." })]);
  assert.equal(before.readyForFitting, true);
  assert.equal(after.readyForFitting, false);
  assert.equal(after.attention, 0);

  const blank = sum(style({ id: "s1" }), [sample({ received_date: "2026-07-20", fit_notes: "   " })]);
  assert.equal(blank.readyForFitting, true);
});

test("nothing logged only nags while the style is actually in development", () => {
  assert.equal(sum(style({ id: "s1", status: "inspo" }), []).attention, 0);
  assert.equal(sum(style({ id: "s1", status: "archived" }), []).attention, 0);
  assert.equal(sum(style({ id: "s1", status: "development" }), []).attention, 200);
});

test("a month of silence is a nudge, not an alarm", () => {
  const quiet = sum(style({ id: "s1", updated_at: "2026-06-01T09:00:00Z" }), [
    sample({ received_date: "2026-05-20", fit_notes: "Approved." }),
  ]);
  assert.equal(quiet.attention, 100);
  assert.equal(quiet.attentionLabel, "Quiet 64 days");

  const yesterday = sum(style({ id: "s1", updated_at: "2026-08-03T09:00:00Z" }), [
    sample({ received_date: "2026-05-20", fit_notes: "Approved." }),
  ]);
  assert.equal(yesterday.attention, 0);
  assert.equal(yesterday.attentionLabel, "");
});

test("with no updated_at the created date stands in", () => {
  const s = sum(style({ id: "s1", updated_at: null, created_at: "2026-06-01" }), [
    sample({ received_date: "2026-05-20", fit_notes: "Approved." }),
  ]);
  assert.equal(s.attention, 100);
  assert.equal(s.touchedAt, "2026-06-01");
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

test("progress climbs through the rounds, and a round coming back is a half step", () => {
  const out = sum(style({ id: "s1" }), [sample({ round: "proto1", submitted_date: "2026-06-01" })]);
  const back = sum(style({ id: "s1" }), [sample({ round: "proto1", submitted_date: "2026-06-01", received_date: "2026-06-12" })]);
  const later = sum(style({ id: "s1" }), [sample({ round: "proto2", submitted_date: "2026-06-20" })]);

  assert.ok(out.progress < back.progress);
  assert.ok(back.progress < later.progress);
});

test("bulk in hand is one, and nothing overshoots it", () => {
  const s = sum(style({ id: "s1" }), [sample({ round: "bulk", received_date: "2026-07-30", fit_notes: "Good." })]);
  assert.equal(s.progress, 1);
  assert.ok(s.progress <= 1);
});

// ---------------------------------------------------------------------------
// Grouping and the whole grid
// ---------------------------------------------------------------------------

test("rounds group by style, and rows with no style are dropped rather than pooled", () => {
  const grouped = groupSamples([
    sample({ style_id: "a", round: "proto1" }),
    sample({ style_id: "b", round: "proto1" }),
    sample({ style_id: "a", round: "proto2" }),
    sample({ style_id: null, round: "proto1" }),
    sample({ style_id: "  ", round: "proto1" }),
  ]);
  assert.equal(grouped.size, 2);
  assert.equal(grouped.get("a")?.length, 2);
  assert.equal(grouped.get("b")?.length, 1);
});

test("every style gets a summary, including the ones with no rounds", () => {
  const styles = [style({ id: "a" }), style({ id: "b" })];
  const all = summarizeAll(styles, [sample({ style_id: "a", round: "proto2" })], ORDER, LABELS, TODAY);
  assert.equal(all.size, 2);
  assert.equal(all.get("a")?.roundKey, "proto2");
  assert.equal(all.get("b")?.roundKey, "");
  // The page hands DevTabs a plain object built from this — it has to survive.
  assert.equal(Object.fromEntries(all).b.styleId, "b");
});

// ---------------------------------------------------------------------------
// The ordering
// ---------------------------------------------------------------------------

function fake(id: string, over: Partial<DevSummary>): DevSummary {
  return {
    styleId: id,
    roundKey: "",
    roundLabel: "",
    etaState: "none",
    etaLabel: "",
    etaDays: null,
    progress: 0,
    readyForFitting: false,
    attention: 0,
    attentionLabel: "",
    rating: "",
    status: "",
    touchedAt: "2026-01-01",
    ...over,
  };
}

const GRID: DevStyleLike[] = [
  style({ id: "late" }),
  style({ id: "calm" }),
  style({ id: "rail-old" }),
  style({ id: "rail-new" }),
  style({ id: "nearly" }),
];

const MAP = new Map<string, DevSummary>([
  ["late", fake("late", { attention: 1007, progress: 0.4, touchedAt: "2026-08-01" })],
  ["calm", fake("calm", { progress: 0.2, touchedAt: "2026-08-04" })],
  ["rail-old", fake("rail-old", { attention: 500, readyForFitting: true, progress: 0.5, touchedAt: "2026-05-01" })],
  ["rail-new", fake("rail-new", { attention: 500, readyForFitting: true, progress: 0.6, touchedAt: "2026-08-02" })],
  ["nearly", fake("nearly", { progress: 0.95, touchedAt: "2026-07-01" })],
]);

test("recent is last-touched first", () => {
  assert.deepEqual(
    sortStyles(GRID, MAP, "recent").map((s) => s.id),
    ["calm", "rail-new", "late", "nearly", "rail-old"]
  );
});

test("needs attention is overdue, then the rail, then the quiet ones — nothing hidden", () => {
  const order = sortStyles(GRID, MAP, "attention").map((s) => s.id);
  assert.equal(order[0], "late");
  assert.deepEqual(order.slice(1, 3).sort(), ["rail-new", "rail-old"]);
  assert.equal(order.length, GRID.length); // a sort reorders; it never filters
});

test("closest to final is furthest through the rounds first", () => {
  assert.deepEqual(
    sortStyles(GRID, MAP, "final").map((s) => s.id),
    ["nearly", "rail-new", "rail-old", "late", "calm"]
  );
});

test("ready for fitting puts the rail first, longest-sitting at the front of it", () => {
  const order = sortStyles(GRID, MAP, "fitting").map((s) => s.id);
  assert.deepEqual(order.slice(0, 2), ["rail-old", "rail-new"]);
  assert.equal(order.length, GRID.length);
});

test("a style with no summary sorts last instead of throwing", () => {
  const styles = [style({ id: "ghost" }), style({ id: "calm" })];
  assert.deepEqual(
    sortStyles(styles, MAP, "attention").map((s) => s.id),
    ["calm", "ghost"]
  );
});

test("an unknown sort id falls back to recent rather than randomising the grid", () => {
  assert.deepEqual(
    sortStyles(GRID, MAP, "whatever").map((s) => s.id),
    sortStyles(GRID, MAP, "recent").map((s) => s.id)
  );
});

test("A–Z orders by name, needs no summary, and puts the unnamed last", () => {
  // The point of az and newest is that they read the row, not the summary — a
  // style with no rounds logged still sorts. The empty Map proves it.
  const styles: DevStyleLike[] = [
    style({ id: "b", name: "Beta" }),
    style({ id: "a", name: "alpha" }), // lower-case, still ahead of Beta
    style({ id: "z", name: "Zeta" }),
    style({ id: "n", name: "" }), // no name sorts last, not first
  ];
  assert.deepEqual(
    sortStyles(styles, new Map(), "az").map((s) => s.id),
    ["a", "b", "z", "n"]
  );
});

test("Newly added orders by created_at, newest first, undated last", () => {
  const styles: DevStyleLike[] = [
    style({ id: "old", created_at: "2026-01-01" }),
    style({ id: "new", created_at: "2026-08-01" }),
    style({ id: "mid", created_at: "2026-05-01" }),
    style({ id: "none", created_at: null }),
  ];
  assert.deepEqual(
    sortStyles(styles, new Map(), "newest").map((s) => s.id),
    ["new", "mid", "old", "none"]
  );
});

test("the order is total and stable — two renders of the same data match", () => {
  const tie = [style({ id: "x" }), style({ id: "y" }), style({ id: "z" })];
  const map = new Map<string, DevSummary>([
    ["x", fake("x", { touchedAt: "2026-08-01" })],
    ["y", fake("y", { touchedAt: "2026-08-01" })],
    ["z", fake("z", { touchedAt: "2026-08-01" })],
  ]);
  for (const id of DEV_SORT_IDS) {
    assert.deepEqual(sortStyles(tie, map, id).map((s) => s.id), ["x", "y", "z"]);
    assert.deepEqual(
      sortStyles(sortStyles(tie, map, id), map, id).map((s) => s.id),
      ["x", "y", "z"]
    );
  }
});

test("sorting does not mutate the list it was handed", () => {
  const before = GRID.map((s) => s.id);
  sortStyles(GRID, MAP, "attention");
  assert.deepEqual(GRID.map((s) => s.id), before);
});

// ---------------------------------------------------------------------------
// --- The rating on the thumbnail (Tess, 2026-08-06) -------------------------

test("the summary carries the rating of the round the style is on", () => {
  const s1 = sum({ id: "s1", status: "development" }, [
    { style_id: "s1", round: "proto1", rating: "poor", created_at: "2026-01-01" },
    { style_id: "s1", round: "proto2", rating: "good", created_at: "2026-02-01" },
  ]);
  // proto2, not the newest row by accident — the same currentSample rule the
  // round label uses, so the dot and the words describe the same sample.
  assert.equal(s1.rating, "good");
});

test("the summary carries the current round's fitting status for the card", () => {
  // The card reads this in place of the arrival date once a sample is in
  // (Tess, 2026-08-10). It is the status of the round the style is ON — same
  // currentSample rule as the rating and the round label.
  const s = sum({ id: "s1", status: "development" }, [
    { style_id: "s1", round: "proto1", status: "with designer", created_at: "2026-01-01" },
    { style_id: "s1", round: "proto2", status: "notes sent to factory", received_date: "2026-08-06", created_at: "2026-02-01" },
  ]);
  assert.equal(s.status, "notes sent to factory");
  assert.equal(s.etaState, "landed"); // received, so the card shows the status
  // No status set reads as empty rather than inventing one.
  assert.equal(sum({ id: "s2" }, [{ style_id: "s2", round: "proto1", created_at: "2026-01-01" }]).status, "");
});

test("a late-entered earlier round does not steal the dot", () => {
  const s1 = sum({ id: "s1", status: "development" }, [
    { style_id: "s1", round: "proto2", rating: "good", created_at: "2026-01-01" },
    { style_id: "s1", round: "proto1", rating: "poor", created_at: "2026-02-01" },
  ]);
  assert.equal(s1.rating, "good");
});

test("an unrated round, an unknown word and no rounds at all are all no dot", () => {
  assert.equal(
    sum({ id: "s1" }, [{ style_id: "s1", round: "proto1", created_at: "2026-01-01" }]).rating,
    ""
  );
  assert.equal(
    sum({ id: "s1" }, [
      { style_id: "s1", round: "proto1", rating: "excellent", created_at: "2026-01-01" },
    ]).rating,
    ""
  );
  assert.equal(sum({ id: "s1" }, []).rating, "");
});
