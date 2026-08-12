import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeItems,
  normalizeKind,
  addItems,
  removeItem,
  reorderItems,
  setItemField,
  buildLinesheet,
  buildEntry,
  entryColorNames,
  groupByColor,
  swatchForColor,
  pickApprovedStyleId,
  type LinesheetItem,
  type LinesheetVersion,
} from "./linesheet.ts";

const v = (styleId: string, isSelf: boolean, approved: boolean): LinesheetVersion => ({
  styleId,
  factory: null,
  roundLabel: null,
  rating: "",
  approved,
  isSelf,
});

// The linesheet's stored order and per-item edits are the thing a future change
// could quietly break, so these pin the rules rather than the framework.

test("normalizeItems keeps order, de-dupes by style_id, and drops junk", () => {
  const out = normalizeItems([
    { style_id: "a" },
    { style_id: "a" }, // duplicate dropped
    "nonsense", // not an object
    { style_id: "" }, // empty id dropped
    { style_id: "b", price: " $175 ", note: "  hero fleece " },
  ]);
  assert.deepEqual(out, [
    { style_id: "a" },
    { style_id: "b", price: "$175", note: "hero fleece" },
  ]);
});

test("normalizeItems is total — non-array is an empty list", () => {
  assert.deepEqual(normalizeItems(null), []);
  assert.deepEqual(normalizeItems({ style_id: "a" }), []);
});

test("addItems appends only the styles not already present, in order", () => {
  const items: LinesheetItem[] = [{ style_id: "a", price: "$1" }];
  const out = addItems(items, ["a", "b", "", "c", "b"]);
  assert.deepEqual(out, [{ style_id: "a", price: "$1" }, { style_id: "b" }, { style_id: "c" }]);
});

test("removeItem drops one style and leaves the rest untouched", () => {
  const items: LinesheetItem[] = [{ style_id: "a" }, { style_id: "b" }, { style_id: "c" }];
  assert.deepEqual(removeItem(items, "b"), [{ style_id: "a" }, { style_id: "c" }]);
});

test("reorderItems follows the given order and never drops an unnamed style", () => {
  const items: LinesheetItem[] = [{ style_id: "a" }, { style_id: "b" }, { style_id: "c" }];
  // Only a and c named; b is not lost — it trails the named ones.
  assert.deepEqual(reorderItems(items, ["c", "a"]), [
    { style_id: "c" },
    { style_id: "a" },
    { style_id: "b" },
  ]);
});

test("setItemField sets a value, and a blank clears the key", () => {
  const items: LinesheetItem[] = [{ style_id: "a", price: "$1", note: "keep" }];
  assert.deepEqual(setItemField(items, "a", { price: "$2" }), [
    { style_id: "a", price: "$2", note: "keep" },
  ]);
  assert.deepEqual(setItemField(items, "a", { price: "  " }), [{ style_id: "a", note: "keep" }]);
  // A style that is not the target is untouched.
  assert.deepEqual(setItemField(items, "z", { price: "$9" }), items);
});

test("buildLinesheet: subtitle, colours fall back to the free-text line, plural count", () => {
  const sheet = buildLinesheet(
    { name: "FW26 Launch", kind: "seasonal", subtitle: "FW26" },
    [
      {
        styleId: "a",
        name: "Cropped Crewneck",
        styleNo: "SS-101",
        garment: "Crewneck",
        season: "FW26", // the style's own season, used in the entry line
        price: "$175",
        colors: "black / bone",
        colorways: [], // none → the free-text `colors` line is what a view shows
        sketchUrl: "u1",
        rating: "good",
      },
    ]
  );
  assert.equal(sheet.count, 1);
  assert.equal(sheet.kindLabel, "Seasonal");
  assert.equal(sheet.subtitle, "FW26"); // the sheet-level optional label
  const e = sheet.entries[0];
  assert.equal(e.subtitle, "Crewneck · FW26"); // style no is no longer in the subtitle
  assert.equal(e.price, "$175");
  assert.equal(e.colors, "black / bone");
  assert.deepEqual(e.colorways, []);
  assert.equal(e.empty, false); // has a sketch
});

test("buildEntry: no sketch and no colorway image reads as empty; name defaults", () => {
  const sheet = buildLinesheet({ name: "", kind: "evergreen" }, [
    { styleId: "x", name: "", sketchUrl: null, colorways: [] },
  ]);
  assert.equal(sheet.name, "Untitled linesheet");
  assert.equal(sheet.kindLabel, "Evergreen");
  assert.equal(sheet.entries[0].name, "Untitled style");
  assert.equal(sheet.entries[0].empty, true);
});

test("pickApprovedStyleId prefers the self style, then any, else null", () => {
  // Self approved wins even when a sibling is also approved.
  assert.equal(pickApprovedStyleId([v("self", true, true), v("sib", false, true)]), "self");
  // Self not approved but a sibling is → the sibling.
  assert.equal(pickApprovedStyleId([v("self", true, false), v("sib", false, true)]), "sib");
  // None approved → null.
  assert.equal(pickApprovedStyleId([v("self", true, false), v("sib", false, false)]), null);
});

test("entryColorNames prefers colorway captions, else splits the free-text line", () => {
  assert.deepEqual(
    entryColorNames(buildEntry({ styleId: "a", name: "x", colorways: [{ url: "u1", name: "Ecru" }, { url: "u2", name: "Sage" }] })),
    ["Ecru", "Sage"]
  );
  // no colorways → split the free-text colours line, de-dup case-insensitively
  assert.deepEqual(
    entryColorNames(buildEntry({ styleId: "a", name: "x", colors: "Black / Bone, black" })),
    ["Black", "Bone"]
  );
});

test("groupByColor puts a multi-colour style in each group, Unsorted last", () => {
  const entries = [
    buildEntry({ styleId: "a", name: "Tank", colors: "Black / Bone" }),
    buildEntry({ styleId: "b", name: "Trouser", colors: "Black" }),
    buildEntry({ styleId: "c", name: "Shirt", colors: "" }), // no colour → Unsorted
  ];
  const groups = groupByColor(entries);
  assert.deepEqual(
    groups.map((g) => [g.color, g.entries.map((e) => e.styleId)]),
    [
      ["Black", ["a", "b"]],
      ["Bone", ["a"]],
      ["Unsorted", ["c"]],
    ]
  );
});

test("swatchForColor returns that colourway's image, else the sketch", () => {
  const e = buildEntry({
    styleId: "a",
    name: "x",
    sketchUrl: "sketch",
    colorways: [{ url: "ecru.jpg", name: "Ecru" }],
  });
  assert.equal(swatchForColor(e, "Ecru"), "ecru.jpg");
  assert.equal(swatchForColor(e, "Sage"), "sketch"); // no match → sketch
});

test("normalizeKind only ever yields the two kinds", () => {
  assert.equal(normalizeKind("evergreen"), "evergreen");
  assert.equal(normalizeKind("seasonal"), "seasonal");
  assert.equal(normalizeKind("nonsense"), "seasonal");
  assert.equal(normalizeKind(undefined), "seasonal");
});
