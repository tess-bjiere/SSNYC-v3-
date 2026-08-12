import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeNotes,
  addNote,
  addReplyTo,
  setNoteText,
  removeNote,
  type Note,
} from "./notes.ts";

const note = (tid: string, text = "hi", by = "tess"): Note => ({
  tid,
  text,
  by,
  ts: 1,
  replies: [],
});

test("normalizeNotes keeps well-formed notes and drops junk", () => {
  const out = normalizeNotes([
    { tid: "a", text: " hello ", by: "tess", ts: 5, replies: [{ id: "r1", text: "hi", by: "kara", ts: 6 }] },
    { tid: "", text: "no id" }, // dropped
    { text: "no tid" }, // dropped
    { tid: "b", text: "   " }, // empty text dropped
    "nonsense",
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].tid, "a");
  assert.equal(out[0].text, "hello");
  assert.deepEqual(out[0].replies, [{ id: "r1", text: "hi", by: "kara", ts: 6 }]);
});

test("normalizeNotes is total on non-arrays", () => {
  assert.deepEqual(normalizeNotes(null), []);
  assert.deepEqual(normalizeNotes({ tid: "a" }), []);
});

test("addNote appends; addReplyTo threads under the right note", () => {
  const notes = [note("a"), note("b")];
  assert.equal(addNote(notes, note("c")).length, 3);
  const replied = addReplyTo(notes, "b", { id: "r", by: "kara", ts: 2, text: "yes" });
  assert.deepEqual(replied[0].replies, []);
  assert.deepEqual(replied[1].replies, [{ id: "r", by: "kara", ts: 2, text: "yes" }]);
});

test("setNoteText updates the target; a blank is ignored", () => {
  const notes = [note("a", "old")];
  assert.equal(setNoteText(notes, "a", " new ")[0].text, "new");
  assert.equal(setNoteText(notes, "a", "   ")[0].text, "old"); // blank leaves it
  assert.equal(setNoteText(notes, "z", "x")[0].text, "old"); // wrong tid, no change
});

test("removeNote drops one note", () => {
  assert.deepEqual(
    removeNote([note("a"), note("b")], "a").map((n) => n.tid),
    ["b"]
  );
});
