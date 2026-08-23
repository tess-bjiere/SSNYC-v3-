import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FRED_TAXONOMY,
  FRED_CATEGORIES,
  fredTypesFor,
  fredCodeFor,
  fredCodeForCategory,
  fredNextSequence,
  formatFredNumber,
  suggestFredNumber,
  isFredStyleNumber,
} from "./fredStyleNumber.ts";

test("every code in the taxonomy is a unique two digits", () => {
  const codes = FRED_TAXONOMY.flatMap((c) => c.types.map((t) => t.code));
  assert.equal(new Set(codes).size, codes.length, "codes must not collide");
  for (const c of codes) assert.match(c, /^\d{2}$/);
});

test("a category's first Type is its family anchor", () => {
  assert.equal(fredCodeForCategory("Tops"), "20");
  assert.equal(fredCodeForCategory("Bottoms"), "30");
  assert.equal(fredCodeForCategory("Accessories"), "60");
  // Not a category (it's a Type, or not in FRED at all) → no code.
  assert.equal(fredCodeForCategory("Shirting"), null);
  assert.equal(fredCodeForCategory("Dresses"), null);
});

test("the Type refines the code within the family", () => {
  assert.equal(fredCodeFor("Tops", "Shirting"), "21");
  assert.equal(fredCodeFor("Tops", "Knitwear"), "22");
  assert.equal(fredCodeFor("Bottoms", "Denim"), "30");
  assert.equal(fredCodeFor("Bottoms", "Trousers"), "31");
  assert.equal(fredCodeFor("Accessories", "Bags"), "61");
  // A Type that isn't in the family falls back to the anchor rather than guessing.
  assert.equal(fredCodeFor("Tops", "Nonsense"), "20");
  // No Type → anchor.
  assert.equal(fredCodeFor("Home"), "90");
});

test("fredTypesFor lists a family's refinements", () => {
  const tops = fredTypesFor("Tops").map((t) => t.label);
  assert.ok(tops.includes("Shirting") && tops.includes("Knitwear"));
  assert.deepEqual(fredTypesFor("Dresses"), []);
});

test("FRED_CATEGORIES are the families in order", () => {
  assert.equal(FRED_CATEGORIES[0], "Innerwear");
  assert.ok(FRED_CATEGORIES.includes("Home"));
  assert.ok(!FRED_CATEGORIES.includes("Dresses")); // no allocation
});

test("next sequence is one past the MAX in that code — gaps never backfill", () => {
  const existing = ["FR-20001", "FR-20003", "FR-21007", "FR-30001"];
  assert.equal(fredNextSequence(existing, "20"), 4);
  assert.equal(fredNextSequence(existing, "21"), 8);
  assert.equal(fredNextSequence(existing, "40"), 1);
});

test("formatFredNumber zero-pads to three", () => {
  assert.equal(formatFredNumber("22", 1), "FR-22001");
  assert.equal(formatFredNumber("11", 42), "FR-11042");
});

test("suggestFredNumber uses the Type's code and the next sequence", () => {
  const existing = ["FR-21001", "FR-21002", "FR-20005"];
  assert.equal(suggestFredNumber(existing, "Tops", "Shirting"), "FR-21003");
  assert.equal(suggestFredNumber(existing, "Tops", "T-shirts & jersey"), "FR-20006");
  assert.equal(suggestFredNumber([], "Innerwear", "Socks"), "FR-11001");
  // Off-allocation category → nothing to suggest.
  assert.equal(suggestFredNumber(existing, "Dresses", null), null);
});

test("suggestFredNumber refuses to overflow a full code", () => {
  assert.equal(suggestFredNumber(["FR-21999"], "Tops", "Shirting"), null);
});

test("isFredStyleNumber accepts only FR- + five digits", () => {
  assert.equal(isFredStyleNumber("FR-21001"), true);
  assert.equal(isFredStyleNumber("FR-2101"), false);
  assert.equal(isFredStyleNumber("SS-1042"), false);
  assert.equal(isFredStyleNumber(null), false);
});
