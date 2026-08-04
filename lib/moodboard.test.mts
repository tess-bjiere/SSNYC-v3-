// Board-transform tests. Run with:  npm run test:moodboard
//
// These cover the rules that protect existing board data: nothing an editor does
// may drop an item, orphan it from its section, or silently re-file the trailing
// unsectioned group. No database needed — every transform here is pure.

import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReorder,
  insertItems,
  removeImage,
  toSections,
  itemKind,
  type MBItem,
  type MBImageItem,
  type MBDividerItem,
  type MBTextItem,
} from "./moodboard.ts";

let z = 0;
const img = (iid: string, gi?: number): MBImageItem => ({
  iid,
  ref_id: `ref-${iid}`,
  x: 60,
  y: 60,
  z: z++,
  w: 180,
  ...(gi === undefined ? {} : { gi }),
});
const div = (tid: string, text: string, gi: number): MBDividerItem => ({
  kind: "divider",
  tid,
  text,
  x: 60,
  y: 60,
  z: z++,
  w: 520,
  gi,
});
const note = (tid: string, text: string): MBTextItem => ({
  kind: "text",
  tid,
  text,
  x: 60,
  y: 60,
  z: z++,
  w: 240,
  by: "tess",
  listOnly: true,
  replies: [],
});

// A board shaped like a real one: two named sections, a note, and a trailing
// group of images added from the library that were never filed into a section.
function board(): MBItem[] {
  return [
    div("d1", "Outerwear", 0),
    img("a", 1),
    img("b", 2),
    div("d2", "Knitwear", 3),
    img("c", 4),
    note("n1", "Check the shoulder line"),
    img("loose1"),
    img("loose2"),
  ];
}

const ids = (items: MBItem[]) =>
  items.map((i) => (itemKind(i) === "image" ? (i as MBImageItem).iid : (i as MBDividerItem).tid)).sort();

// ---------------------------------------------------------------------------

test("toSections reads the fixture board the way the grid renders it", () => {
  const { sections, notes } = toSections(board());
  assert.deepEqual(
    sections.map((s) => [s.label, s.images.map((i) => i.iid)]),
    [
      ["Outerwear", ["a", "b"]],
      ["Knitwear", ["c"]],
      [null, ["loose1", "loose2"]],
    ]
  );
  assert.equal(notes.length, 1);
});

test("applyReorder moves an image between sections without losing anything", () => {
  const before = board();
  // Drag "c" (Knitwear) up into Outerwear, between a and b.
  const order = ["d1", "a", "c", "b", "d2", "loose1", "loose2"];
  const after = applyReorder(before, order);

  assert.deepEqual(ids(after), ids(before), "no item added or dropped");
  const { sections } = toSections(after);
  assert.deepEqual(
    sections.map((s) => [s.label, s.images.map((i) => i.iid)]),
    [
      ["Outerwear", ["a", "c", "b"]],
      ["Knitwear", []],
      [null, ["loose1", "loose2"]],
    ]
  );
});

test("applyReorder leaves the trailing unsectioned group unsectioned", () => {
  const after = applyReorder(board(), ["d1", "a", "b", "d2", "c", "loose1", "loose2"]);
  const loose = after.filter(
    (i) => itemKind(i) === "image" && (i as MBImageItem).iid.startsWith("loose")
  );
  assert.equal(loose.length, 2);
  for (const l of loose) {
    assert.equal(typeof l.gi, "undefined", `${(l as MBImageItem).iid} must keep no gi`);
  }
  const { sections } = toSections(after);
  assert.deepEqual(
    sections.map((s) => [s.label, s.images.map((i) => i.iid)]),
    [
      ["Outerwear", ["a", "b"]],
      ["Knitwear", ["c"]],
      [null, ["loose1", "loose2"]],
    ],
    "the last section keeps its own images even though they follow the last divider"
  );
});

test("applyReorder can file a loose image into a section on purpose", () => {
  // Dragging loose1 above a divider is a deliberate move, so it sticks.
  const after = applyReorder(board(), ["d1", "a", "b", "loose1", "d2", "c", "loose2"]);
  const { sections } = toSections(after);
  assert.deepEqual(sections[0].images.map((i) => i.iid), ["a", "b", "loose1"]);
  assert.deepEqual(sections[1].images.map((i) => i.iid), ["c"]);
  assert.deepEqual(sections.at(-1)?.images.map((i) => i.iid), ["loose2"]);
});

test("applyReorder never touches notes", () => {
  const after = applyReorder(board(), ["d1", "a", "b", "d2", "c"]);
  const n = after.find((i) => itemKind(i) === "text") as MBTextItem;
  assert.equal(n.text, "Check the shoulder line");
  assert.equal(typeof n.gi, "undefined");
});

test("applyReorder ignores ids that are not on the board", () => {
  const before = board();
  const after = applyReorder(before, ["d1", "a", "ghost", "b", "d2", "c"]);
  assert.deepEqual(ids(after), ids(before));
});

test("section reorder (the ↑/↓ arrows) swaps two whole sections", () => {
  const after = applyReorder(board(), ["d2", "c", "d1", "a", "b", "loose1", "loose2"]);
  const { sections } = toSections(after);
  assert.deepEqual(
    sections.map((s) => [s.label, s.images.map((i) => i.iid)]),
    [
      ["Knitwear", ["c"]],
      ["Outerwear", ["a", "b"]],
      [null, ["loose1", "loose2"]],
    ]
  );
});

test("insertItems with no target appends unsectioned, exactly as before", () => {
  const before = board();
  const add = [img("new1"), img("new2")];
  const after = insertItems(before, add);
  assert.deepEqual(after.slice(0, before.length), before, "existing items untouched and in order");
  const { sections } = toSections(after);
  assert.deepEqual(sections.at(-1)?.images.map((i) => i.iid), [
    "loose1",
    "loose2",
    "new1",
    "new2",
  ]);
});

test("insertItems drops new images at the end of the target section", () => {
  const after = insertItems(board(), [img("new1")], "d1");
  const { sections } = toSections(after);
  assert.deepEqual(
    sections.map((s) => [s.label, s.images.map((i) => i.iid)]),
    [
      ["Outerwear", ["a", "b", "new1"]],
      ["Knitwear", ["c"]],
      [null, ["loose1", "loose2"]],
    ]
  );
});

test("insertItems into the last section keeps the loose group behind it", () => {
  const after = insertItems(board(), [img("new1")], "d2");
  const { sections } = toSections(after);
  assert.deepEqual(sections[1].images.map((i) => i.iid), ["c", "new1"]);
  assert.deepEqual(sections.at(-1)?.label, null);
  assert.deepEqual(sections.at(-1)?.images.map((i) => i.iid), ["loose1", "loose2"]);
});

test("insertItems renumbers gi contiguously with no gaps or duplicates", () => {
  const after = insertItems(board(), [img("new1"), img("new2")], "d1");
  const gis = after
    .filter((i) => typeof i.gi === "number")
    .map((i) => i.gi as number)
    .sort((p, q) => p - q);
  assert.deepEqual(gis, gis.map((_, i) => i));
});

test("insertItems falls back to the end of the board if the section is gone", () => {
  const before = board();
  const after = insertItems(before, [img("new1")], "does-not-exist");
  assert.deepEqual(after.slice(0, before.length), before);
  assert.equal(after.length, before.length + 1);
});

test("insertItems keeps notes on the board", () => {
  const after = insertItems(board(), [img("new1")], "d1");
  assert.equal(after.filter((i) => itemKind(i) === "text").length, 1);
});

test("removeImage takes exactly one tile and leaves the rest of the board alone", () => {
  const before = board();
  const after = removeImage(before, "b");
  assert.equal(after.length, before.length - 1);
  assert.deepEqual(
    after,
    before.filter((i) => (i as MBImageItem).iid !== "b"),
    "every surviving item is byte-identical, gi included"
  );
  const { sections, notes } = toSections(after);
  assert.deepEqual(
    sections.map((s) => [s.label, s.images.map((i) => i.iid)]),
    [
      ["Outerwear", ["a"]],
      ["Knitwear", ["c"]],
      [null, ["loose1", "loose2"]],
    ]
  );
  assert.equal(notes.length, 1, "notes survive");
});

test("removeImage only removes the tile asked for, not other placements of the ref", () => {
  // Same reference placed twice under different iids — removing one keeps the other.
  const twin: MBImageItem = { ...img("twin", 1), ref_id: "ref-a" };
  const before = [...board(), twin];
  const after = removeImage(before, "a");
  const survivor = after.find((i) => (i as MBImageItem).iid === "twin") as MBImageItem;
  assert.ok(survivor, "the other placement of ref-a stays");
  assert.equal(survivor.ref_id, "ref-a");
});

test("removeImage never removes a divider or a note that shares the id", () => {
  const after = removeImage(board(), "d1");
  assert.deepEqual(ids(after), ids(board()), "a divider tid is not an image iid");
  assert.equal(removeImage(board(), "n1").filter((i) => itemKind(i) === "text").length, 1);
});

test("removeImage on an unknown id is a no-op", () => {
  const before = board();
  assert.deepEqual(removeImage(before, "ghost"), before);
});

test("a board still reorders correctly after a removal leaves a gi gap", () => {
  const after = applyReorder(removeImage(board(), "a"), ["d1", "b", "d2", "c", "loose1", "loose2"]);
  const { sections } = toSections(after);
  assert.deepEqual(
    sections.map((s) => [s.label, s.images.map((i) => i.iid)]),
    [
      ["Outerwear", ["b"]],
      ["Knitwear", ["c"]],
      [null, ["loose1", "loose2"]],
    ]
  );
});

// The grid now renders every tile at one uniform size, so a stored `w` is ignored
// at render time. It must still survive untouched in the data: boards made in the
// original tool carry per-image widths and we never rewrite them.
test("stored per-image widths survive every board edit untouched", () => {
  const before: MBItem[] = [
    div("d1", "Outerwear", 0),
    { ...img("wide", 1), w: 360 },
    { ...img("narrow", 2), w: 90 },
    img("loose"),
  ];
  const w = (items: MBItem[], iid: string) =>
    (items.find((i) => (i as MBImageItem).iid === iid) as MBImageItem | undefined)?.w;

  const reordered = applyReorder(before, ["d1", "narrow", "wide", "loose"]);
  assert.equal(w(reordered, "wide"), 360);
  assert.equal(w(reordered, "narrow"), 90);

  const inserted = insertItems(before, [{ ...img("new1"), w: 180 }], "d1");
  assert.equal(w(inserted, "wide"), 360);
  assert.equal(w(inserted, "narrow"), 90);

  const removed = removeImage(before, "narrow");
  assert.equal(w(removed, "wide"), 360);
});

test("a legacy board with no gi at all still renders and survives an edit", () => {
  const legacy: MBItem[] = [img("x"), img("y"), img("z")];
  assert.deepEqual(toSections(legacy).sections, [
    { label: null, images: legacy as MBImageItem[] },
  ]);
  const after = applyReorder(legacy, ["y", "x", "z"]);
  assert.deepEqual(ids(after), ids(legacy));
  // No dividers anywhere, so nothing gets filed into a phantom section.
  assert.ok(after.every((i) => typeof i.gi === "undefined"));
});
