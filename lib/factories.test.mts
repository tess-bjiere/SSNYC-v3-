import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UNASSIGNED,
  factoryKey,
  factoryOf,
  openRound,
  groupByFactory,
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
