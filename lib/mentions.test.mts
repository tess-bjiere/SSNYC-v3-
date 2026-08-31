import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMentions, localPart } from "./mentions.ts";

const TEAM = ["kara@theloyalist.com", "lucas@theloyalist.com", "Tess@theloyalist.com"];

test("resolves a bare @local-part to the teammate's address", () => {
  assert.deepEqual(parseMentions("@kara can you check the rib?", TEAM), ["kara@theloyalist.com"]);
});

test("resolves a full @address, and is case-insensitive", () => {
  assert.deepEqual(parseMentions("cc @Kara@Theloyalist.com", TEAM), ["kara@theloyalist.com"]);
  assert.deepEqual(parseMentions("@LUCAS take a look", TEAM), ["lucas@theloyalist.com"]);
});

test("an unknown token resolves to nobody", () => {
  assert.deepEqual(parseMentions("@here @nobody look at this", TEAM), []);
});

test("de-duplicates and keeps first-appearance order", () => {
  assert.deepEqual(
    parseMentions("@lucas and @kara — @lucas again", TEAM),
    ["lucas@theloyalist.com", "kara@theloyalist.com"]
  );
});

test("a plain address in running text (no leading @) is not a mention", () => {
  // "kara@theloyalist.com" here — the "@" belongs to the address, so the token
  // captured is the domain, which is not a teammate.
  assert.deepEqual(parseMentions("reach me at kara@theloyalist.com anytime", TEAM), []);
});

test("a body with no @ short-circuits to empty", () => {
  assert.deepEqual(parseMentions("looks good, ship it", TEAM), []);
  assert.deepEqual(parseMentions(null, TEAM), []);
});

test("localPart splits on the @, or returns the whole string when there is none", () => {
  assert.equal(localPart("kara@theloyalist.com"), "kara");
  assert.equal(localPart("kara"), "kara");
});
