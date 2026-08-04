import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRollout,
  filterRollout,
  rowFor,
  shotListLine,
  sortShotList,
  statusWeight,
  summarize,
  worstSlot,
  type RolloutSlot,
  type RolloutStyle,
} from "./photoRollout.ts";

// Three slots rather than five: the arithmetic is the thing under test, not
// today's standard, and a test that has to be rewritten when a sixth shot is
// added to the standard is a test that will be deleted instead.
const SLOTS: RolloutSlot[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "detail", label: "Detail" },
];

function style(over: Partial<RolloutStyle> = {}): RolloutStyle {
  return { id: "s1", name: "Tank", status: "development", photos: {}, ...over };
}

test("a style with nothing shot is untouched, not merely incomplete", () => {
  const r = rowFor(style(), SLOTS);
  assert.equal(r.filled, 0);
  assert.equal(r.total, 3);
  assert.equal(r.untouched, true);
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ["front", "back", "detail"]);
});

test("missing slots come back in standard order, not stored order", () => {
  const r = rowFor(style({ photos: { detail: "d.jpg" } }), SLOTS);
  assert.deepEqual(r.missing, ["front", "back"]);
});

test("a blank string is not a photograph", () => {
  const r = rowFor(style({ photos: { front: "   ", back: "b.jpg" } }), SLOTS);
  assert.equal(r.filled, 1);
  assert.deepEqual(r.missing, ["front", "detail"]);
});

test("junk in the jsonb never throws and never counts", () => {
  for (const photos of [null, undefined, [] as unknown, "nope" as unknown, { front: 3 } as unknown]) {
    const r = rowFor(style({ photos: photos as RolloutStyle["photos"] }), SLOTS);
    assert.equal(r.filled, 0);
  }
});

test("a key for a slot that is not in the standard is ignored", () => {
  const r = rowFor(style({ photos: { front: "f.jpg", campaign: "c.jpg" } }), SLOTS);
  assert.equal(r.filled, 1);
  assert.equal(r.total, 3);
});

test("all slots shot reads complete", () => {
  const r = rowFor(style({ photos: { front: "f", back: "b", detail: "d" } }), SLOTS);
  assert.equal(r.complete, true);
  assert.deepEqual(r.missing, []);
});

test("production outranks development outranks inspo, archived last", () => {
  assert.ok(statusWeight("production") < statusWeight("development"));
  assert.ok(statusWeight("development") < statusWeight("inspo"));
  assert.ok(statusWeight("inspo") < statusWeight("archived"));
  // A status nobody recognises sorts above archived: it might be real work.
  assert.ok(statusWeight("weird") < statusWeight("archived"));
  assert.ok(statusWeight(null) < statusWeight("archived"));
});

test("the shot list puts the pipeline first and the nearly-done first within it", () => {
  const rows = buildRollout(
    [
      style({ id: "a", name: "Inspo one", status: "inspo", photos: { front: "f", back: "b" } }),
      style({ id: "b", name: "Prod none", status: "production", photos: {} }),
      style({ id: "c", name: "Prod nearly", status: "production", photos: { front: "f", back: "b" } }),
      style({ id: "d", name: "Dev half", status: "development", photos: { front: "f" } }),
    ],
    SLOTS
  );
  assert.deepEqual(
    sortShotList(rows).map((r) => r.style.id),
    ["c", "b", "d", "a"]
  );
});

test("two rows that tie on everything sort by name, the same way twice", () => {
  const rows = buildRollout(
    [
      style({ id: "z", name: "Zip Hoodie", status: "production" }),
      style({ id: "a", name: "Anorak", status: "production" }),
    ],
    SLOTS
  );
  assert.deepEqual(sortShotList(rows).map((r) => r.style.name), ["Anorak", "Zip Hoodie"]);
  assert.deepEqual(
    sortShotList(sortShotList(rows)).map((r) => r.style.name),
    ["Anorak", "Zip Hoodie"]
  );
});

test("sorting does not disturb the array it was handed", () => {
  const rows = buildRollout(
    [style({ id: "z", name: "Zed" }), style({ id: "a", name: "Ay" })],
    SLOTS
  );
  sortShotList(rows);
  assert.deepEqual(rows.map((r) => r.style.id), ["z", "a"]);
});

test("the to-do view drops completed styles and archived ones", () => {
  const rows = buildRollout(
    [
      style({ id: "done", name: "Done", photos: { front: "f", back: "b", detail: "d" } }),
      style({ id: "arch", name: "Archived", status: "archived", photos: {} }),
      style({ id: "todo", name: "Todo", status: "production", photos: {} }),
    ],
    SLOTS
  );
  assert.deepEqual(filterRollout(rows, "todo").map((r) => r.style.id), ["todo"]);
});

test("an archived style is still reachable, and still counted", () => {
  const rows = buildRollout(
    [
      style({ id: "arch", name: "Archived", status: "archived", photos: {} }),
      style({ id: "todo", name: "Todo", status: "production", photos: {} }),
    ],
    SLOTS
  );
  assert.deepEqual(filterRollout(rows, "all").map((r) => r.style.id), ["todo", "arch"]);
  assert.equal(summarize(rows, SLOTS).styles, 2);
});

test("the complete view shows only finished styles, by name", () => {
  const rows = buildRollout(
    [
      style({ id: "b", name: "Beta", photos: { front: "f", back: "b", detail: "d" } }),
      style({ id: "a", name: "Alpha", photos: { front: "f", back: "b", detail: "d" } }),
      style({ id: "c", name: "Gamma", photos: {} }),
    ],
    SLOTS
  );
  assert.deepEqual(filterRollout(rows, "complete").map((r) => r.style.name), ["Alpha", "Beta"]);
});

test("the summary counts photographs, not styles", () => {
  const rows = buildRollout(
    [
      style({ id: "a", photos: { front: "f" } }),
      style({ id: "b", photos: { front: "f", back: "b", detail: "d" } }),
    ],
    SLOTS
  );
  const s = summarize(rows, SLOTS);
  assert.equal(s.styles, 2);
  assert.equal(s.complete, 1);
  assert.equal(s.shotsDone, 4);
  assert.equal(s.shotsTotal, 6);
});

test("the per-slot tally says which shot the studio is worst at", () => {
  const rows = buildRollout(
    [
      style({ id: "a", photos: { front: "f", back: "b" } }),
      style({ id: "b", photos: { front: "f" } }),
      style({ id: "c", photos: { front: "f", back: "b" } }),
    ],
    SLOTS
  );
  assert.deepEqual(
    summarize(rows, SLOTS).bySlot.map((t) => [t.id, t.shot, t.missing]),
    [
      ["front", 3, 0],
      ["back", 2, 1],
      ["detail", 0, 3],
    ]
  );
});

test("an unfinished library never rounds up to 100%", () => {
  // 299 of 300 is 99.67, and a page reading "100% · 1 left" is a page nobody
  // believes the second time.
  const rows = Array.from({ length: 100 }, (_, i) =>
    style({ id: "s" + i, photos: i === 0 ? { front: "f", back: "b" } : { front: "f", back: "b", detail: "d" } })
  );
  const s = summarize(buildRollout(rows, SLOTS), SLOTS);
  assert.equal(s.shotsDone, 299);
  assert.equal(s.percent, 99);
});

test("a finished library does read 100%", () => {
  const rows = buildRollout([style({ photos: { front: "f", back: "b", detail: "d" } })], SLOTS);
  assert.equal(summarize(rows, SLOTS).percent, 100);
});

test("an empty library is 0%, not a division by zero", () => {
  const s = summarize([], SLOTS);
  assert.equal(s.percent, 0);
  assert.equal(s.shotsTotal, 0);
  assert.equal(worstSlot(s), null);
});

test("the shot-list line names what is missing, in words", () => {
  assert.equal(shotListLine(rowFor(style({ photos: {} }), SLOTS)), "Nothing shot yet");
  assert.equal(
    shotListLine(rowFor(style({ photos: { front: "f", back: "b" } }), SLOTS)),
    "Needs Detail"
  );
  assert.equal(
    shotListLine(rowFor(style({ photos: { front: "f" } }), SLOTS)),
    "Needs Back and Detail"
  );
  assert.equal(
    shotListLine(rowFor(style({ photos: { front: "f", back: "b", detail: "d" } }), SLOTS)),
    "Complete"
  );
});

test("no slot is called out when the library is evenly behind", () => {
  const rows = buildRollout(
    [style({ id: "a", photos: {} }), style({ id: "b", photos: {} })],
    SLOTS
  );
  // Every slot missing on every style: there is nothing to single out.
  assert.equal(worstSlot(summarize(rows, SLOTS)), null);
});

test("a slot that is genuinely behind is called out", () => {
  const rows = buildRollout(
    Array.from({ length: 6 }, (_, i) => style({ id: "s" + i, photos: { front: "f", back: "b" } })),
    SLOTS
  );
  assert.equal(worstSlot(summarize(rows, SLOTS))?.id, "detail");
});

test("one straggler out of many is not a finding", () => {
  const rows = buildRollout(
    Array.from({ length: 10 }, (_, i) =>
      style({ id: "s" + i, photos: i === 0 ? { front: "f", back: "b" } : { front: "f", back: "b", detail: "d" } })
    ),
    SLOTS
  );
  assert.equal(worstSlot(summarize(rows, SLOTS)), null);
});
