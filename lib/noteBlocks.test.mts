import { test } from "node:test";
import assert from "node:assert/strict";
import { hasBullets, parseNoteBlocks } from "./noteBlocks.ts";

test("plain text with no bullets is one text block, line breaks intact", () => {
  assert.equal(hasBullets("just a note\nsecond line"), false);
  assert.deepEqual(parseNoteBlocks("just a note\nsecond line"), [
    { kind: "text", text: "just a note\nsecond line" },
  ]);
});

test("a run of dash lines becomes one list; the marker and its space are stripped", () => {
  assert.equal(hasBullets("- one\n- two"), true);
  assert.deepEqual(parseNoteBlocks("- one\n- two\n- three"), [
    { kind: "list", items: ["one", "two", "three"] },
  ]);
});

test("*, - and • all count, and indentation before the marker is allowed", () => {
  assert.deepEqual(parseNoteBlocks("* star\n  - dash\n• dot"), [
    { kind: "list", items: ["star", "dash", "dot"] },
  ]);
});

test("text and lists interleave, in order", () => {
  const blocks = parseNoteBlocks("Fit notes:\n- shoulder too wide\n- hem uneven\nOtherwise good");
  assert.deepEqual(blocks, [
    { kind: "text", text: "Fit notes:" },
    { kind: "list", items: ["shoulder too wide", "hem uneven"] },
    { kind: "text", text: "Otherwise good" },
  ]);
});

test("a bare dash with no space is NOT a bullet — a minus sign stays text", () => {
  // "-2cm" is a measurement, not a list.
  assert.equal(hasBullets("-2cm at the waist"), false);
  assert.deepEqual(parseNoteBlocks("-2cm at the waist"), [
    { kind: "text", text: "-2cm at the waist" },
  ]);
});

test("empty input is no blocks", () => {
  assert.deepEqual(parseNoteBlocks(""), []);
  assert.deepEqual(parseNoteBlocks(null), []);
  assert.equal(hasBullets(null), false);
});
