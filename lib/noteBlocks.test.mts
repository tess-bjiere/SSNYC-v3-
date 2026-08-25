import { test } from "node:test";
import assert from "node:assert/strict";
import { hasBullets, parseNoteBlocks, type BulletItem } from "./noteBlocks.ts";

// A tiny helper so the expectations read as trees, not nested object literals.
function leaf(text: string): BulletItem {
  return { text, children: [] };
}

test("plain text with no bullets is one text block, line breaks intact", () => {
  assert.equal(hasBullets("just a note\nsecond line"), false);
  assert.deepEqual(parseNoteBlocks("just a note\nsecond line"), [
    { kind: "text", text: "just a note\nsecond line" },
  ]);
});

test("a run of top-level dashes becomes one flat list", () => {
  assert.equal(hasBullets("- one\n- two"), true);
  assert.deepEqual(parseNoteBlocks("- one\n- two\n- three"), [
    { kind: "list", items: [leaf("one"), leaf("two"), leaf("three")] },
  ]);
});

test("indented bullets nest under the one above — two spaces OR a tab per level", () => {
  const spaces = parseNoteBlocks("- top\n  - sub a\n  - sub b\n- next");
  assert.deepEqual(spaces, [
    {
      kind: "list",
      items: [
        { text: "top", children: [leaf("sub a"), leaf("sub b")] },
        leaf("next"),
      ],
    },
  ]);
  // A tab indents the same as two spaces.
  const tabs = parseNoteBlocks("- top\n\t- sub");
  assert.deepEqual(tabs, [
    { kind: "list", items: [{ text: "top", children: [leaf("sub")] }] },
  ]);
});

test("three levels deep", () => {
  const out = parseNoteBlocks("- a\n  - b\n    - c");
  assert.deepEqual(out, [
    {
      kind: "list",
      items: [{ text: "a", children: [{ text: "b", children: [leaf("c")] }] }],
    },
  ]);
});

test("*, - and • all count as markers", () => {
  assert.deepEqual(parseNoteBlocks("* star\n- dash\n• dot"), [
    { kind: "list", items: [leaf("star"), leaf("dash"), leaf("dot")] },
  ]);
});

test("text and lists interleave, in order", () => {
  const blocks = parseNoteBlocks("Fit notes:\n- shoulder too wide\n  - re-cut the yoke\nOtherwise good");
  assert.deepEqual(blocks, [
    { kind: "text", text: "Fit notes:" },
    {
      kind: "list",
      items: [{ text: "shoulder too wide", children: [leaf("re-cut the yoke")] }],
    },
    { kind: "text", text: "Otherwise good" },
  ]);
});

test("a bare dash with no space is NOT a bullet — a minus sign stays text", () => {
  assert.equal(hasBullets("-2cm at the waist"), false);
  assert.deepEqual(parseNoteBlocks("-2cm at the waist"), [
    { kind: "text", text: "-2cm at the waist" },
  ]);
});

test("blank lines between bullets keep one list, so a sub-bullet stays nested", () => {
  // People put a blank line between points for air; that must NOT split the list
  // and strand an indented sub-bullet as a top-level mark (Tess, 2026-08-24:
  // bullets "rendering very weird and messy").
  const blocks = parseNoteBlocks("• Correct the label\n\n• Racer back\n\n  • Fit is perfection");
  assert.deepEqual(blocks, [
    {
      kind: "list",
      items: [
        { text: "Correct the label", children: [] },
        { text: "Racer back", children: [leaf("Fit is perfection")] },
      ],
    },
  ]);
  // A blank line before ordinary prose still ends the list.
  assert.deepEqual(parseNoteBlocks("- one\n\nJust a sentence"), [
    { kind: "list", items: [leaf("one")] },
    { kind: "text", text: "Just a sentence" },
  ]);
});

test("empty input is no blocks", () => {
  assert.deepEqual(parseNoteBlocks(""), []);
  assert.deepEqual(parseNoteBlocks(null), []);
  assert.equal(hasBullets(null), false);
});
