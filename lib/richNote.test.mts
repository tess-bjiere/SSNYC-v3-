import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRich,
  isRich,
  docToText,
  blocksToDoc,
  isEmptyDoc,
  type RichDoc,
} from "./richNote.ts";
import { parseNoteBlocks } from "./noteBlocks.ts";

test("a plain-text note is never mistaken for a rich doc", () => {
  assert.equal(isRich("• a bullet\n• another"), false);
  assert.equal(isRich("just a sentence"), false);
  assert.equal(isRich(""), false);
  assert.equal(isRich(null), false);
  // Even a note that happens to contain a brace is not a doc unless it parses.
  assert.equal(isRich("cost is {tbd}"), false);
});

test("a stored TipTap doc is recognised and read back", () => {
  const doc: RichDoc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
  };
  const stored = JSON.stringify(doc);
  assert.deepEqual(parseRich(stored), doc);
  assert.equal(isRich(stored), true);
  assert.equal(docToText(stored), "hello");
});

test("plain text with sub-bullets round-trips through a doc unchanged", () => {
  // This is the exact shape that rendered wonky: bullets with a nested sub-point.
  const text = "• Front armhole needs filling\n• Back armhole over ¾”\n  • Confirm elastic is stable";
  const doc = blocksToDoc(parseNoteBlocks(text));
  // The nested point becomes a real nested list under its parent.
  assert.equal(doc.content.length, 1);
  assert.equal(doc.content[0].type, "bulletList");
  const items = doc.content[0].content!;
  assert.equal(items.length, 2);
  // Second item carries the sub-list.
  assert.ok(items[1].content!.some((c) => c.type === "bulletList"));
  // Flattening the doc gives the bulleted text back, with the sub-bullet
  // normalised to a dash (a dot at the top level, a dash below).
  assert.equal(
    docToText(JSON.stringify(doc)),
    "• Front armhole needs filling\n• Back armhole over ¾”\n  - Confirm elastic is stable"
  );
});

test("blocksToDoc imports plain paragraphs and flattens back to the same text", () => {
  const imported = blocksToDoc(parseNoteBlocks("plain line"));
  assert.equal(imported.type, "doc");
  assert.equal(docToText(JSON.stringify(imported)), "plain line");
});

test("an empty note reads as empty whether it is blank text or an empty doc", () => {
  assert.equal(isEmptyDoc(""), true);
  assert.equal(isEmptyDoc("   "), true);
  assert.equal(isEmptyDoc(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })), true);
  assert.equal(isEmptyDoc("• real content"), false);
});
