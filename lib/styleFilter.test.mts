// Search and filters for the development grid.
//
// The thing worth guarding is not that a search finds a match — it is that a
// grid never hides anything by accident. Every test below is either "the words
// somebody would actually type find the thing they are thinking of" or "an
// untouched control changes nothing".

import test from "node:test";
import assert from "node:assert/strict";

import {
  NO_FILTERS,
  anyFilter,
  applyFilters,
  facetOptions,
  findStyles,
  hiddenBy,
  matchesSearch,
  resultLabel,
  searchStyles,
  searchTerms,
  type SearchableStyle,
} from "./styleFilter.ts";

const STYLES: SearchableStyle[] = [
  {
    id: "a",
    name: "Anorak Jacket",
    style_no: "SS-100",
    season: "SS27",
    garment: "Jacket",
    category: "Outerwear",
    fabric: "Cotton twill",
    colors: "black / bone",
    factory: "Bella",
    designer: "Test",
    brand: "The Loyalist",
    notes: "This is a hero",
  },
  {
    id: "b",
    name: "Cargo Trouser",
    style_no: "SS-101",
    season: "SS27",
    garment: "Trouser",
    category: "Bottoms",
    fabric: "Ripstop",
    colors: "olive",
    factory: "bella",
    designer: "Lorny",
  },
  {
    id: "c",
    name: "Silk Shell",
    style_no: "AW-002",
    season: "AW27",
    garment: "Top",
    category: "Tops",
    fabric: "Silk habotai",
    colors: "bone",
    factory: "Toni",
  },
  { id: "d", name: "Untitled" },
];

test("an empty query is not a filter — everything comes back, in order", () => {
  assert.deepEqual(searchStyles(STYLES, "").map((s) => s.id), ["a", "b", "c", "d"]);
  assert.deepEqual(searchStyles(STYLES, null).map((s) => s.id), ["a", "b", "c", "d"]);
  assert.deepEqual(searchStyles(STYLES, "   ").map((s) => s.id), ["a", "b", "c", "d"]);
  // And never the caller's own array, so sorting the result cannot reorder the page.
  assert.notEqual(searchStyles(STYLES, ""), STYLES);
});

test("the words somebody has in their head find the style", () => {
  assert.deepEqual(searchStyles(STYLES, "anorak").map((s) => s.id), ["a"]);
  assert.deepEqual(searchStyles(STYLES, "SS-100").map((s) => s.id), ["a"]);
  assert.deepEqual(searchStyles(STYLES, "ss-100").map((s) => s.id), ["a"]);
  // Colour, fabric, designer, factory, notes — all searchable.
  assert.deepEqual(searchStyles(STYLES, "olive").map((s) => s.id), ["b"]);
  assert.deepEqual(searchStyles(STYLES, "ripstop").map((s) => s.id), ["b"]);
  assert.deepEqual(searchStyles(STYLES, "lorny").map((s) => s.id), ["b"]);
  assert.deepEqual(searchStyles(STYLES, "toni").map((s) => s.id), ["c"]);
  assert.deepEqual(searchStyles(STYLES, "hero").map((s) => s.id), ["a"]);
});

test("a half-typed word finds it before you finish typing", () => {
  assert.deepEqual(searchStyles(STYLES, "jack").map((s) => s.id), ["a"]);
  assert.deepEqual(searchStyles(STYLES, "trou").map((s) => s.id), ["b"]);
});

test("two words both have to appear, in either order, across any fields", () => {
  // "black jacket": the colour is in colors, the garment is in garment.
  assert.deepEqual(searchStyles(STYLES, "black jacket").map((s) => s.id), ["a"]);
  assert.deepEqual(searchStyles(STYLES, "jacket black").map((s) => s.id), ["a"]);
  // Both words must land. "black trouser" is nothing, not "everything black".
  assert.deepEqual(searchStyles(STYLES, "black trouser").map((s) => s.id), []);
  assert.deepEqual(searchStyles(STYLES, "bella ss27").map((s) => s.id), ["a", "b"]);
});

test("a phrase inside one field can be typed with its space in", () => {
  assert.deepEqual(searchStyles(STYLES, "cotton twill").map((s) => s.id), ["a"]);
  assert.deepEqual(searchStyles(STYLES, "silk habotai").map((s) => s.id), ["c"]);
});

test("a style with almost nothing on it is not a crash and not a false match", () => {
  assert.deepEqual(searchStyles(STYLES, "untitled").map((s) => s.id), ["d"]);
  assert.equal(matchesSearch({}, ["anything"]), false);
  assert.equal(matchesSearch({}, []), true);
});

test("the query splits on commas as well as spaces, because people type both", () => {
  assert.deepEqual(searchTerms("black, jacket"), ["black", "jacket"]);
  assert.deepEqual(searchTerms("  BLACK   Jacket "), ["black", "jacket"]);
  assert.deepEqual(searchTerms(""), []);
  assert.deepEqual(searchTerms(null), []);
});

test("the filter options are only the values that exist, commonest first", () => {
  assert.deepEqual(facetOptions(STYLES, "season"), [
    { value: "SS27", count: 2 },
    { value: "AW27", count: 1 },
  ]);
  // "Bella" and "bella" are one factory, shown as the first spelling seen.
  assert.deepEqual(facetOptions(STYLES, "factory"), [
    { value: "Bella", count: 2 },
    { value: "Toni", count: 1 },
  ]);
  // Ties break alphabetically so the list does not shuffle between renders.
  assert.deepEqual(facetOptions(STYLES, "category"), [
    { value: "Bottoms", count: 1 },
    { value: "Outerwear", count: 1 },
    { value: "Tops", count: 1 },
  ]);
  assert.deepEqual(facetOptions([], "season"), []);
});

test("an untouched filter hides nothing", () => {
  assert.deepEqual(applyFilters(STYLES, NO_FILTERS).map((s) => s.id), ["a", "b", "c", "d"]);
  assert.equal(anyFilter(NO_FILTERS), false);
  assert.equal(anyFilter(NO_FILTERS, ""), false);
  // An empty season means "no opinion" — NOT "styles with no season", which
  // would silently hide every row that has one.
  assert.equal(applyFilters(STYLES, { ...NO_FILTERS, season: "" }).length, 4);
});

test("a chosen filter is case-insensitive and combines with the others", () => {
  assert.deepEqual(applyFilters(STYLES, { ...NO_FILTERS, factory: "bella" }).map((s) => s.id), ["a", "b"]);
  assert.deepEqual(applyFilters(STYLES, { ...NO_FILTERS, factory: "BELLA" }).map((s) => s.id), ["a", "b"]);
  assert.deepEqual(
    applyFilters(STYLES, { ...NO_FILTERS, factory: "Bella", category: "Outerwear" }).map((s) => s.id),
    ["a"]
  );
  assert.equal(anyFilter({ ...NO_FILTERS, factory: "Bella" }), true);
  assert.equal(anyFilter(NO_FILTERS, "anorak"), true);
});

test("search and filters compose", () => {
  assert.deepEqual(findStyles(STYLES, "ss27", { ...NO_FILTERS, factory: "Bella" }).map((s) => s.id), ["a", "b"]);
  assert.deepEqual(findStyles(STYLES, "jacket", { ...NO_FILTERS, factory: "Toni" }).map((s) => s.id), []);
  assert.deepEqual(findStyles(STYLES, "", NO_FILTERS).map((s) => s.id), ["a", "b", "c", "d"]);
});

test("the grid can always say how much it is hiding", () => {
  assert.equal(hiddenBy(41, 3), 38);
  assert.equal(hiddenBy(41, 41), 0);
  assert.equal(hiddenBy(3, 9), 0);
  assert.equal(resultLabel(41, 41), "41 styles");
  assert.equal(resultLabel(1, 1), "1 style");
  assert.equal(resultLabel(41, 3), "3 of 41 styles");
  assert.equal(resultLabel(41, 0), "Nothing matches — 41 styles hidden");
  assert.equal(resultLabel(0, 0), "No styles");
});
