import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHex,
  normalizeSwatch,
  normalizePalette,
  normalizePaletteLibrary,
  normalizeBoardPalettes,
  filledSlots,
  resolveBoardPalettes,
  remapBoardKeys,
  slotLabel,
  EVERGREEN_KEY,
  UNFILED_SEASON,
} from "./palette.ts";

// The palette is written by hand into a brand row, so every reader defends
// against half-typed and pasted junk. These pin the rules a future edit could
// undo without noticing.

test("normalizeHex expands, lowercases and requires a real colour", () => {
  assert.equal(normalizeHex("#AABBCC"), "#aabbcc");
  assert.equal(normalizeHex("aabbcc"), "#aabbcc"); // a missing # is still a colour
  assert.equal(normalizeHex("#abc"), "#aabbcc"); // three-digit shorthand expands
  assert.equal(normalizeHex("#12345"), ""); // five digits is not a colour
  assert.equal(normalizeHex("PANTONE 186"), ""); // a name is not a hex
  assert.equal(normalizeHex(null), "");
});

test("a swatch survives on a colour alone, a name alone, or both", () => {
  assert.deepEqual(normalizeSwatch({ hex: "#ff0000", name: "" }), { hex: "#ff0000", name: "" });
  assert.deepEqual(normalizeSwatch({ hex: "", name: "PANTONE 186 C" }), { hex: "", name: "PANTONE 186 C" });
  assert.deepEqual(normalizeSwatch({ hex: "#abc", name: " Ruby " }), { hex: "#aabbcc", name: "Ruby" });
});

test("a swatch survives on an uploaded pattern alone, and carries it through", () => {
  assert.deepEqual(normalizeSwatch({ hex: "", name: "", image: "https://x/p.jpg" }), {
    hex: "",
    name: "",
    image: "https://x/p.jpg",
  });
  // No image key when there is no image, so a plain colour swatch stays {hex,name}.
  assert.deepEqual(normalizeSwatch({ hex: "#ff0000", name: "Red" }), { hex: "#ff0000", name: "Red" });
});

test("a swatch with neither a colour, a name, nor a pattern is dropped", () => {
  assert.equal(normalizeSwatch({ hex: "", name: "" }), null);
  assert.equal(normalizeSwatch({ hex: "not-a-colour", name: "   ", image: "" }), null);
  assert.equal(normalizeSwatch("nonsense"), null);
});

test("normalizePalette keeps the two groups and drops empties", () => {
  const pal = normalizePalette({
    seasonal: [{ hex: "#ff0000", name: "Poppy" }, { hex: "", name: "" }],
    evergreen: [{ hex: "#000000", name: "Black" }],
    // a stray key a future shape might carry is ignored
    junk: [{ hex: "#fff" }],
  });
  assert.deepEqual(pal, {
    seasonal: [{ hex: "#ff0000", name: "Poppy" }],
    evergreen: [{ hex: "#000000", name: "Black" }],
  });
});

test("normalizePalette is total — missing or malformed input becomes empty groups", () => {
  assert.deepEqual(normalizePalette(null), { seasonal: [], evergreen: [] });
  assert.deepEqual(normalizePalette({ seasonal: "not-an-array" }), { seasonal: [], evergreen: [] });
  assert.deepEqual(normalizePalette(undefined), { seasonal: [], evergreen: [] });
});

// ---------------------------------------------------------------------------
// Palette library — one palette per season + an evergreen one, added to a board
// on purpose (Tess, 2026-09-09: "saved to a season and then allowed to be added
// to a moodboard -- not just applied to all moodboards").

test("normalizePaletteLibrary reads the new shape and drops empty seasons", () => {
  const lib = normalizePaletteLibrary({
    evergreen: [{ hex: "#000000", name: "Black" }],
    seasons: {
      FW26: [{ hex: "#8b0000", name: "Oxblood" }, { hex: "", name: "" }],
      SS26: [{ hex: "", name: "" }], // all junk -> season vanishes
      "  ": [{ hex: "#fff" }], // blank key -> ignored
    },
  });
  assert.deepEqual(lib.evergreen, [{ hex: "#000000", name: "Black" }]);
  assert.deepEqual(Object.keys(lib.seasons), ["FW26"]);
  assert.deepEqual(lib.seasons.FW26, [{ hex: "#8b0000", name: "Oxblood" }]);
});

test("normalizePaletteLibrary migrates the legacy {seasonal, evergreen} palette", () => {
  const lib = normalizePaletteLibrary({
    seasonal: [{ hex: "#ff0000", name: "Poppy" }],
    evergreen: [{ hex: "#000000", name: "Black" }],
  });
  assert.deepEqual(lib.evergreen, [{ hex: "#000000", name: "Black" }]);
  // The untagged seasonal list is preserved under Unfiled, not lost.
  assert.deepEqual(lib.seasons[UNFILED_SEASON], [{ hex: "#ff0000", name: "Poppy" }]);
});

test("normalizePaletteLibrary does not re-migrate once a seasons map exists", () => {
  // A row already on the new shape may still carry a stray `seasonal` key; it is
  // ignored so a migrated row does not keep resurrecting Unfiled.
  const lib = normalizePaletteLibrary({
    seasonal: [{ hex: "#ff0000", name: "Poppy" }],
    seasons: { FW26: [{ hex: "#8b0000", name: "Oxblood" }] },
    evergreen: [],
  });
  assert.deepEqual(Object.keys(lib.seasons), ["FW26"]);
  assert.equal(lib.seasons[UNFILED_SEASON], undefined);
});

test("normalizePaletteLibrary is total for junk input", () => {
  assert.deepEqual(normalizePaletteLibrary(null), { evergreen: [], seasons: {} });
  assert.deepEqual(normalizePaletteLibrary("nope"), { evergreen: [], seasons: {} });
});

test("filledSlots lists evergreen first, then seasons by name, colours only", () => {
  const lib = normalizePaletteLibrary({
    evergreen: [{ hex: "#000000", name: "Black" }],
    seasons: {
      SS26: [{ hex: "#87ceeb", name: "Sky" }],
      FW26: [{ hex: "#8b0000", name: "Oxblood" }],
    },
  });
  assert.deepEqual(
    filledSlots(lib).map((s) => [s.key, s.label]),
    [[EVERGREEN_KEY, "Evergreen"], ["FW26", "FW26"], ["SS26", "SS26"]]
  );
});

test("normalizeBoardPalettes trims, de-dupes and keeps order", () => {
  assert.deepEqual(normalizeBoardPalettes(["FW26", " FW26 ", "evergreen", 7, ""]), [
    "FW26",
    "evergreen",
  ]);
  assert.deepEqual(normalizeBoardPalettes(null), []);
});

test("resolveBoardPalettes returns only the board's keys, in order, that still hold colour", () => {
  const lib = normalizePaletteLibrary({
    evergreen: [{ hex: "#000000", name: "Black" }],
    seasons: { FW26: [{ hex: "#8b0000", name: "Oxblood" }] },
  });
  // SS26 was added to the board but has since been emptied -> skipped.
  const shown = resolveBoardPalettes(lib, ["FW26", "SS26", "evergreen"]);
  assert.deepEqual(
    shown.map((s) => [s.key, s.swatches.length]),
    [["FW26", 1], ["evergreen", 1]]
  );
});

test("slotLabel names evergreen and passes season keys through", () => {
  assert.equal(slotLabel(EVERGREEN_KEY), "Evergreen");
  assert.equal(slotLabel("FW26"), "FW26");
});

test("remapBoardKeys renames a board's key so a renamed palette stays attached", () => {
  assert.deepEqual(
    remapBoardKeys(["evergreen", "Spring / Summer 2027"], [
      { from: "Spring / Summer 2027", to: "SS27" },
    ]),
    ["evergreen", "SS27"]
  );
});

test("remapBoardKeys leaves boards that never had the palette untouched", () => {
  assert.deepEqual(
    remapBoardKeys(["evergreen", "FW26"], [{ from: "SS27", to: "Spring 2027" }]),
    ["evergreen", "FW26"]
  );
});

test("remapBoardKeys de-dupes when a rename collides with a key the board already has", () => {
  // Board had both FW26 and "Fall"; renaming Fall -> FW26 must not duplicate.
  assert.deepEqual(
    remapBoardKeys(["FW26", "Fall"], [{ from: "Fall", to: "FW26" }]),
    ["FW26"]
  );
});

test("remapBoardKeys with no renames just normalizes the list", () => {
  assert.deepEqual(remapBoardKeys(["FW26", " FW26 ", "", 3 as unknown as string], []), ["FW26"]);
});
