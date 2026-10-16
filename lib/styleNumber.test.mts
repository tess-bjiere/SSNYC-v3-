import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_TAXONOMY,
  PRODUCT_CATEGORIES,
  typesFor,
  codeFor,
  codeForCategory,
  nextSequence,
  formatStyleNumber,
  suggestStyleNumber,
  isHouseStyleNumber,
} from "./styleNumber.ts";

test("every code in the taxonomy is a unique two digits", () => {
  const codes = PRODUCT_TAXONOMY.flatMap((c) => c.types.map((t) => t.code));
  assert.equal(new Set(codes).size, codes.length, "codes must not collide");
  for (const c of codes) assert.match(c, /^\d{2}$/);
});

test("a category's first Type is its family anchor", () => {
  assert.equal(codeForCategory("Tops"), "20");
  assert.equal(codeForCategory("Bottoms"), "30");
  assert.equal(codeForCategory("Accessories"), "60");
  // Not a category (it's a Type, or not in the taxonomy at all) → no code.
  assert.equal(codeForCategory("Shirting"), null);
  assert.equal(codeForCategory("Dresses"), null);
});

test("the Type refines the code within the family", () => {
  assert.equal(codeFor("Tops", "Shirting"), "21");
  assert.equal(codeFor("Tops", "Knitwear"), "22");
  assert.equal(codeFor("Bottoms", "Denim"), "30");
  assert.equal(codeFor("Bottoms", "Trousers"), "31");
  assert.equal(codeFor("Accessories", "Bags"), "61");
  // A Type that isn't in the family falls back to the anchor rather than guessing.
  assert.equal(codeFor("Tops", "Nonsense"), "20");
  // No Type → anchor.
  assert.equal(codeFor("Home"), "90");
});

test("typesFor lists a family's refinements", () => {
  const tops = typesFor("Tops").map((t) => t.label);
  assert.ok(tops.includes("Shirting") && tops.includes("Knitwear"));
  assert.deepEqual(typesFor("Dresses"), []);
});

test("PRODUCT_CATEGORIES are the families in order", () => {
  assert.equal(PRODUCT_CATEGORIES[0], "Innerwear");
  assert.ok(PRODUCT_CATEGORIES.includes("Home"));
  assert.ok(!PRODUCT_CATEGORIES.includes("Dresses")); // no allocation
});

test("next sequence is one past the MAX in that code — gaps never backfill", () => {
  const existing = ["ST-20001", "ST-20003", "ST-21007", "ST-30001"];
  assert.equal(nextSequence(existing, "20"), 4);
  assert.equal(nextSequence(existing, "21"), 8);
  assert.equal(nextSequence(existing, "40"), 1);
});

test("formatStyleNumber zero-pads to three", () => {
  assert.equal(formatStyleNumber("22", 1), "ST-22001");
  assert.equal(formatStyleNumber("11", 42), "ST-11042");
});

test("suggestStyleNumber uses the Type's code and the next sequence", () => {
  const existing = ["ST-21001", "ST-21002", "ST-20005"];
  assert.equal(suggestStyleNumber(existing, "Tops", "Shirting"), "ST-21003");
  assert.equal(suggestStyleNumber(existing, "Tops", "T-shirts & jersey"), "ST-20006");
  assert.equal(suggestStyleNumber([], "Innerwear", "Socks"), "ST-11001");
  // Off-allocation category → nothing to suggest.
  assert.equal(suggestStyleNumber(existing, "Dresses", null), null);
});

test("suggestStyleNumber refuses to overflow a full code", () => {
  assert.equal(suggestStyleNumber(["ST-21999"], "Tops", "Shirting"), null);
});

test("isHouseStyleNumber accepts only ST- + five digits", () => {
  assert.equal(isHouseStyleNumber("ST-21001"), true);
  assert.equal(isHouseStyleNumber("ST-2101"), false);
  assert.equal(isHouseStyleNumber("SS-1042"), false);
  assert.equal(isHouseStyleNumber(null), false);
});
