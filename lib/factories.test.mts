import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UNASSIGNED,
  factoryKey,
  factoryOf,
  openRound,
  groupByFactory,
  latestRating,
  rowPhase,
  daysApart,
  turnarounds,
  factoryStats,
  orderRows,
} from "./factories.ts";

const STYLES = [
  { id: "s1", name: "Rib Tank", style_no: "SS27-001", factory: "Jiaxing" },
  { id: "s2", name: "Boxy Tee", style_no: "SS27-002", factory: "Jiaxing" },
  { id: "s3", name: "Ankle Trouser", style_no: "SS27-003", factory: null },
];

function r(over: Record<string, unknown>) {
  return { id: "r" + Math.round(1), style_id: "s1", round: "proto1", ...over } as {
    id: string;
    style_id: string;
    round: string;
    factory?: string | null;
    submitted_date?: string | null;
    received_date?: string | null;
  };
}

test("factoryKey folds the spellings people actually type", () => {
  assert.equal(factoryKey("Jiaxing"), "jiaxing");
  assert.equal(factoryKey("  JIAXING "), "jiaxing");
  assert.equal(factoryKey("Sun  Rise"), "sun rise");
  assert.equal(factoryKey(null), "");
});

test("a round's own factory wins over the style's", () => {
  assert.equal(factoryOf(r({ factory: "Sunrise" }), STYLES[0]), "Sunrise");
  assert.equal(factoryOf(r({ factory: null }), STYLES[0]), "Jiaxing");
  assert.equal(factoryOf(r({ factory: "  " }), STYLES[0]), "Jiaxing");
  assert.equal(factoryOf(r({}), STYLES[2]), UNASSIGNED);
  assert.equal(factoryOf(r({}), undefined), UNASSIGNED);
});

test("the open round is the first one not back yet", () => {
  const rounds = [
    r({ id: "a", round: "proto1", received_date: "2027-01-10" }),
    r({ id: "b", round: "proto2", submitted_date: "2027-02-01" }),
    r({ id: "c", round: "sms" }),
  ];
  assert.equal(openRound(rounds)?.id, "b");
});

test("when everything is back the last round is the current one", () => {
  const rounds = [
    r({ id: "a", round: "proto1", received_date: "2027-01-10" }),
    r({ id: "b", round: "proto2", received_date: "2027-02-20" }),
  ];
  assert.equal(openRound(rounds)?.id, "b");
  assert.equal(openRound([]), null);
});

test("styles group under the factory that is actually making each round", () => {
  const rounds = [
    r({ id: "a", style_id: "s1", round: "proto1", received_date: "2027-01-10" }),
    // The season moved factory mid-development — this is the case the by-factory
    // view exists for.
    r({ id: "b", style_id: "s1", round: "proto2", factory: "Sunrise", submitted_date: "2027-02-01" }),
    r({ id: "c", style_id: "s2", round: "proto1", submitted_date: "2027-02-03" }),
  ];
  const groups = groupByFactory(STYLES, rounds);
  assert.deepEqual(groups.map((g) => g.name), ["Jiaxing", "Sunrise"]);

  const jiaxing = groups[0];
  assert.deepEqual(jiaxing.styles.map((s) => s.style.name), ["Boxy Tee", "Rib Tank"]);
  assert.equal(jiaxing.openCount, 1); // Boxy Tee is out; Rib Tank's proto1 is back
  assert.equal(groups[1].styles[0].open?.id, "b");
});

test("one spelling of a factory is enough to group it, and the first one is shown", () => {
  const rounds = [
    r({ id: "a", style_id: "s1", factory: "Jiaxing" }),
    r({ id: "b", style_id: "s2", factory: "  jiaxing " }),
  ];
  const groups = groupByFactory(STYLES, rounds);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "Jiaxing");
  assert.equal(groups[0].styles.length, 2);
});

test("rounds with no factory anywhere land in Unassigned, and it sorts last", () => {
  const rounds = [
    r({ id: "a", style_id: "s3" }),
    r({ id: "b", style_id: "s1", factory: "Zhejiang" }),
    r({ id: "c", style_id: "s2", factory: "Anhui" }),
  ];
  const groups = groupByFactory(STYLES, rounds);
  assert.deepEqual(groups.map((g) => g.name), ["Anhui", "Zhejiang", UNASSIGNED]);
});

test("a round whose style is gone does not invent a factory", () => {
  const groups = groupByFactory(STYLES, [r({ id: "a", style_id: "missing", factory: "Ghost" })]);
  assert.deepEqual(groups, []);
});

test("rounds keep the order they were handed over, per style", () => {
  const rounds = [
    r({ id: "a", style_id: "s1", round: "proto1", received_date: "2027-01-10" }),
    r({ id: "b", style_id: "s1", round: "proto2", received_date: "2027-02-10" }),
    r({ id: "c", style_id: "s1", round: "sms", submitted_date: "2027-03-01" }),
  ];
  const row = groupByFactory(STYLES, rounds)[0].styles[0];
  assert.deepEqual(row.rounds.map((x) => x.round), ["proto1", "proto2", "sms"]);
  assert.equal(row.open?.round, "sms");
});

test("openCount counts what a factory is holding, not what it has finished", () => {
  const rounds = [
    r({ id: "a", style_id: "s1", submitted_date: "2027-02-01" }),
    r({ id: "b", style_id: "s2", submitted_date: "2027-02-02", received_date: "2027-02-20" }),
    r({ id: "c", style_id: "s3", factory: "Jiaxing" }), // not submitted yet
  ];
  assert.equal(groupByFactory(STYLES, rounds)[0].openCount, 1);
});

// --- archived work ----------------------------------------------------------
//
// Tess, 2026-08-07: "If a style is archived it shouldnt show up under active
// styles in the factory view -- it should show as archived".
//
// The factory still physically has the sample, so it is not dropped. What
// archiving changes is that it stops being work: out of the live list, and out
// of the count of what they owe you.

const MIXED = [
  { id: "a1", name: "Live Tank", style_no: "L-1", factory: "Jiaxing", status: "development" },
  { id: "a2", name: "Dropped Vest", style_no: "D-1", factory: "Jiaxing", status: "archived" },
];

const MIXED_ROUNDS = [
  { id: "m1", style_id: "a1", round: "proto1", submitted_date: "2026-06-01", received_date: null },
  { id: "m2", style_id: "a2", round: "proto1", submitted_date: "2026-06-01", received_date: null },
];

test("an archived style leaves the live list and appears under archived", () => {
  const [g] = groupByFactory(MIXED, MIXED_ROUNDS);
  assert.deepEqual(g.styles.map((r) => r.style.id), ["a1"]);
  assert.deepEqual(g.archived.map((r) => r.style.id), ["a2"]);
});

test("an archived style's open round is not counted as out with them", () => {
  const [g] = groupByFactory(MIXED, MIXED_ROUNDS);
  // Both rounds are submitted and neither is back; only the live one is owed.
  assert.equal(g.openCount, 1);
});

test("an archived style still gets its open round worked out", () => {
  const [g] = groupByFactory(MIXED, MIXED_ROUNDS);
  // It is displayed, so it needs the same shape as a live row — it is just not
  // counted and not chased.
  assert.equal(g.archived[0].open?.id, "m2");
});

test("archived rows sort by name like the live ones", () => {
  const styles = [
    { id: "z", name: "Zebra", factory: "F", status: "archived" },
    { id: "a", name: "Apple", factory: "F", status: "archived" },
  ];
  const rounds = [
    { id: "r1", style_id: "z", round: "proto1" },
    { id: "r2", style_id: "a", round: "proto1" },
  ];
  const [g] = groupByFactory(styles, rounds);
  assert.deepEqual(g.archived.map((r) => r.style.name), ["Apple", "Zebra"]);
});

test("a factory with only archived work still appears, with an empty live list", () => {
  const [g] = groupByFactory([MIXED[1]], [MIXED_ROUNDS[1]]);
  assert.equal(g.styles.length, 0);
  assert.equal(g.archived.length, 1);
  // The factory is still on the page — it has our sample.
  assert.equal(g.name, "Jiaxing");
});

test("status is matched case-insensitively and only on the exact word", () => {
  const styles = [
    { id: "u", name: "Upper", factory: "F", status: "ARCHIVED" },
    { id: "n", name: "Not", factory: "F", status: "unarchived" },
  ];
  const rounds = [
    { id: "r1", style_id: "u", round: "proto1" },
    { id: "r2", style_id: "n", round: "proto1" },
  ];
  const [g] = groupByFactory(styles, rounds);
  assert.deepEqual(g.archived.map((r) => r.style.id), ["u"]);
  assert.deepEqual(g.styles.map((r) => r.style.id), ["n"]);
});

// --- the rating mark --------------------------------------------------------
//
// Tess, 2026-08-07: "in the factory view, styles should have the color rating
// next to them". The mark answers "which of these came back badly", so it has
// to survive the usual case: the round on the row is the one still out, and the
// verdict worth showing is from the round before it.

test("latestRating takes the last judged round, not the last round", () => {
  assert.equal(
    latestRating([
      { id: "1", style_id: "s", rating: "poor" },
      { id: "2", style_id: "s", rating: "workable" },
      // Still out, so nobody has judged it. The verdict above still stands.
      { id: "3", style_id: "s", rating: null },
    ]),
    "workable"
  );
});

test("latestRating is empty when nothing has been judged", () => {
  assert.equal(latestRating([{ id: "1", style_id: "s" }, { id: "2", style_id: "s", rating: "  " }]), "");
  assert.equal(latestRating([]), "");
});

test("latestRating folds the case it is stored in", () => {
  assert.equal(latestRating([{ id: "1", style_id: "s", rating: "Good" }]), "good");
});

test("a row carries the rating of its own factory's rounds only", () => {
  const styles = [{ id: "s1", name: "Rib Tank", factory: "Jiaxing" }];
  const rounds = [
    { id: "r1", style_id: "s1", round: "proto1", factory: "Jiaxing", rating: "poor" },
    { id: "r2", style_id: "s1", round: "proto2", factory: "Porto", rating: "good" },
  ];
  const groups = groupByFactory(styles, rounds);
  const jiaxing = groups.find((g) => g.key === "jiaxing")!;
  const porto = groups.find((g) => g.key === "porto")!;
  // Same style, two factories, two verdicts. Showing one the other's would be
  // wrong, and on a call it would be worse than wrong.
  assert.equal(jiaxing.styles[0].rating, "poor");
  assert.equal(porto.styles[0].rating, "good");
});

test("an archived row gets its rating worked out too", () => {
  const [g] = groupByFactory(
    [{ id: "a", name: "Dropped", factory: "F", status: "archived" }],
    [{ id: "r", style_id: "a", round: "proto1", rating: "poor" }]
  );
  assert.equal(g.archived[0].rating, "poor");
});

// --- what a manager sees ----------------------------------------------------
//
// Tess, 2026-08-07: "What would be the most improtant quick view info for a
// manager to see ... quality, timelines, where they are in the sample process
// and overall logical alignemnt of information".

const TODAY = "2026-08-07";

const mk = (over: Record<string, unknown>) =>
  ({ id: "x", style_id: "s1", round: "proto1", ...over }) as {
    id: string;
    style_id: string;
    round: string;
    submitted_date?: string | null;
    received_date?: string | null;
    rating?: string | null;
    factory?: string | null;
  };

test("a round's phase is what you can do about it, not what it is called", () => {
  assert.equal(rowPhase(mk({ submitted_date: "2026-07-01", received_date: null })), "with_them");
  assert.equal(rowPhase(mk({ submitted_date: "2026-07-01", received_date: "2026-07-12" })), "back");
  assert.equal(rowPhase(mk({ submitted_date: null })), "not_sent");
  // A received date with no sent date is somebody filling the form backwards;
  // it is still back, because the garment is here.
  assert.equal(rowPhase(mk({ submitted_date: null, received_date: "2026-07-12" })), "back");
  assert.equal(rowPhase(null), "not_sent");
});

test("daysApart counts whole days and refuses what it cannot read", () => {
  assert.equal(daysApart("2026-07-01", "2026-07-12"), 11);
  assert.equal(daysApart("2026-07-01", "2026-07-01"), 0);
  assert.equal(daysApart(null, "2026-07-12"), null);
  assert.equal(daysApart("not a date", "2026-07-12"), null);
});

test("a negative turnaround is a typo, not a fast factory", () => {
  const out = turnarounds([
    mk({ submitted_date: "2026-07-01", received_date: "2026-07-12" }),
    mk({ submitted_date: "2026-07-20", received_date: "2026-07-10" }),
    mk({ submitted_date: "2026-07-01", received_date: null }),
  ]);
  assert.deepEqual(out, [11]);
});

const STATS_STYLES = [
  { id: "a", name: "Out Now", factory: "F", status: "development" },
  { id: "b", name: "Back Already", factory: "F", status: "development" },
  { id: "c", name: "Dropped", factory: "F", status: "archived" },
];
const STATS_ROUNDS = [
  { id: "a1", style_id: "a", round: "proto1", submitted_date: "2026-06-01", received_date: "2026-06-11", rating: "good" },
  { id: "a2", style_id: "a", round: "proto2", submitted_date: "2026-07-01", received_date: null },
  { id: "b1", style_id: "b", round: "proto1", submitted_date: "2026-07-20", received_date: "2026-07-28", rating: "poor" },
  { id: "c1", style_id: "c", round: "proto1", submitted_date: "2026-01-01", received_date: null },
];

test("the summary counts phases, quality and turnaround over live work only", () => {
  const [g] = groupByFactory(STATS_STYLES, STATS_ROUNDS);
  const s = factoryStats(g, TODAY);
  assert.equal(s.styles, 2);
  assert.equal(s.withThem, 1);
  assert.equal(s.back, 1);
  assert.equal(s.notSent, 0);
  assert.equal(s.good, 1);
  assert.equal(s.poor, 1);
  // 10 days and 8 days. The archived style's round, open since January, is not
  // in it — it was abandoned, not slow, and averaging it in would libel them.
  assert.equal(s.measured, 2);
  assert.equal(s.avgTurnaround, 9);
});

test("late is measured against this factory's own average, and flagged", () => {
  const [g] = groupByFactory(STATS_STYLES, STATS_ROUNDS);
  const s = factoryStats(g, TODAY);
  // proto2 went out 1 July and it is 7 August: 37 days, against their 9.
  assert.equal(s.overdue, 1);
});

test("under two completed rounds nothing is called late at all", () => {
  const [g] = groupByFactory(
    [{ id: "a", name: "A", factory: "F", status: "development" }],
    [{ id: "a1", style_id: "a", round: "proto1", submitted_date: "2026-01-01", received_date: null }]
  );
  const s = factoryStats(g, TODAY);
  // One measurement is not an average, and this one has none at all. Calling
  // this late would be guessing with a red colour on.
  assert.equal(s.avgTurnaround, null);
  assert.equal(s.overdue, 0);
});

test("rows read in the order a manager works down them", () => {
  const styles = [
    { id: "a", name: "Zeta", factory: "F", status: "development" },
    { id: "b", name: "Alpha", factory: "F", status: "development" },
    { id: "c", name: "Never Sent", factory: "F", status: "development" },
  ];
  const rounds = [
    { id: "a1", style_id: "a", round: "proto1", submitted_date: "2026-06-01", received_date: null },
    { id: "b1", style_id: "b", round: "proto1", submitted_date: "2026-07-25", received_date: null },
    { id: "c1", style_id: "c", round: "proto1", submitted_date: null, received_date: null },
  ];
  const [g] = groupByFactory(styles, rounds);
  const rows = orderRows(g.styles, TODAY, 9);
  // With them first, longest out at the top — Zeta went out in June — then the
  // one nobody has sent. Alphabetical order would have buried the urgent one.
  assert.deepEqual(rows.map((r) => r.style.id), ["a", "b", "c"]);
  assert.deepEqual(rows.map((r) => r.phase), ["with_them", "with_them", "not_sent"]);
  assert.equal(rows[0].daysOut, 67);
  assert.equal(rows[0].late, true);
  assert.equal(rows[2].daysOut, null);
});

test("a row that is back carries how long it took, not how long ago it was", () => {
  const [g] = groupByFactory(
    [{ id: "a", name: "A", factory: "F", status: "development" }],
    [{ id: "a1", style_id: "a", round: "proto1", submitted_date: "2026-06-01", received_date: "2026-06-11" }]
  );
  const [row] = orderRows(g.styles, TODAY, 9);
  assert.equal(row.phase, "back");
  assert.equal(row.turnaround, 10);
  assert.equal(row.daysOut, null);
  assert.equal(row.late, false);
});

test("rounds run here is counted, because a third proto is a story", () => {
  const [g] = groupByFactory(
    [{ id: "a", name: "A", factory: "F", status: "development" }],
    [
      { id: "1", style_id: "a", round: "proto1", submitted_date: "2026-05-01", received_date: "2026-05-10" },
      { id: "2", style_id: "a", round: "proto2", submitted_date: "2026-06-01", received_date: "2026-06-10" },
      { id: "3", style_id: "a", round: "proto3", submitted_date: "2026-07-01", received_date: null },
    ]
  );
  const [row] = orderRows(g.styles, TODAY, 9);
  assert.equal(row.roundsHere, 3);
});

test("quality counts archived work too, because a poor sample was still poor", () => {
  // Tess, 2026-08-07: "on the archived style in maxime's, it should list the
  // red style under rated with red dot even though it's archived".
  const [g] = groupByFactory(
    [
      { id: "live", name: "Live", factory: "F", status: "development" },
      { id: "dead", name: "Dropped", factory: "F", status: "archived" },
    ],
    [
      { id: "1", style_id: "live", round: "proto1", submitted_date: "2026-06-01", received_date: "2026-06-11", rating: "good" },
      { id: "2", style_id: "dead", round: "proto1", submitted_date: "2026-06-01", received_date: "2026-06-11", rating: "poor" },
    ]
  );
  const s = factoryStats(g, TODAY);
  assert.equal(s.good, 1);
  assert.equal(s.poor, 1);
  // But it is still not workload, and it is still not in the turnaround.
  assert.equal(s.styles, 1);
  assert.equal(s.measured, 1);
});

test("an archived style with no rating counts as unrated, not as nothing", () => {
  const [g] = groupByFactory(
    [{ id: "dead", name: "Dropped", factory: "F", status: "archived" }],
    [{ id: "1", style_id: "dead", round: "proto1", submitted_date: "2026-06-01" }]
  );
  const s = factoryStats(g, TODAY);
  assert.equal(s.unrated, 1);
  assert.equal(s.styles, 0);
});
