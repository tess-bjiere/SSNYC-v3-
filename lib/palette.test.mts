import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, normalizeSwatch, normalizePalette } from "./palette.ts";

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
