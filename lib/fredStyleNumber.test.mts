import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fredCodeForCategory,
  fredNextSequence,
  formatFredNumber,
  suggestFredNumber,
  isFredStyleNumber,
} from "./fredStyleNumber.ts";

test("a category maps to its family anchor code; an unallocated one maps to nothing", () => {
  assert.equal(fredCodeForCategory("Underwear"), "10");
  assert.equal(fredCodeForCategory("Socks"), "11");
  assert.equal(fredCodeForCategory("Tops"), "20"); // anchor; user edits to 21/22/23
  assert.equal(fredCodeForCategory("Bottoms"), "30"); // denim anchor
  assert.equal(fredCodeForCategory("Bags"), "61");
  // No home in the allocation → no auto-number, the user fills it in.
  assert.equal(fredCodeForCategory("Dresses"), null);
  assert.equal(fredCodeForCategory("Activewear"), null);
  assert.equal(fredCodeForCategory(""), null);
  assert.equal(fredCodeForCategory(null), null);
});

test("next sequence is one past the MAX in that code, not the count — gaps are never backfilled", () => {
  // 20002 was killed; the next Tops number is still 004, not a refill of 002/003.
  const existing = ["FR-20001", "FR-20003", "FR-11007", "FR-30001"];
  assert.equal(fredNextSequence(existing, "20"), 4);
  // A code with nothing in it starts at 1.
  assert.equal(fredNextSequence(existing, "40"), 1);
  // Other codes do not bleed in.
  assert.equal(fredNextSequence(existing, "11"), 8);
});

test("formatFredNumber zero-pads to three and keeps the code", () => {
  assert.equal(formatFredNumber("20", 1), "FR-20001");
  assert.equal(formatFredNumber("11", 42), "FR-11042");
});

test("suggestFredNumber combines the map and the sequence, and is null off-allocation", () => {
  const existing = ["FR-20001", "FR-20002"];
  assert.equal(suggestFredNumber(existing, "Tops"), "FR-20003");
  assert.equal(suggestFredNumber([], "Underwear"), "FR-10001");
  assert.equal(suggestFredNumber(existing, "Dresses"), null);
});

test("suggestFredNumber refuses to overflow a full code rather than emit a bad number", () => {
  const existing = ["FR-10999"]; // Underwear is full
  assert.equal(suggestFredNumber(existing, "Underwear"), null);
});

test("isFredStyleNumber accepts only FR- + five digits", () => {
  assert.equal(isFredStyleNumber("FR-20001"), true);
  assert.equal(isFredStyleNumber("FR-2001"), false); // four digits
  assert.equal(isFredStyleNumber("SS-1042"), false);
  assert.equal(isFredStyleNumber(""), false);
  assert.equal(isFredStyleNumber(null), false);
});
