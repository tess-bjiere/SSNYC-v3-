import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTES_KEY,
  readNote,
  readNotes,
  withImageNoteCaption,
  withImagePin,
  withImagePinRemoved,
  withImagePinReply,
  withImagePinReplyRemoved,
  noteCountLabel,
  hasNote,
} from "./imageNotes.ts";

const URL_A = "https://cdn.example.com/styles/a/flat_front.jpg";
const URL_B = "https://cdn.example.com/styles/a/shot-2.jpg";

test("an un-annotated image reads as an empty note", () => {
  assert.deepEqual(readNote(null, URL_A), { caption: "", pins: [] });
  assert.deepEqual(readNote({}, URL_A), { caption: "", pins: [] });
  assert.deepEqual(readNote({ flat_front: URL_A }, URL_A), { caption: "", pins: [] });
});

test("garbage in the column never throws and never invents a note", () => {
  for (const junk of [undefined, 0, "", [], "notes", { notes: 7 }, { notes: [] }]) {
    assert.deepEqual(readNote(junk, URL_A), { caption: "", pins: [] });
    assert.deepEqual(readNotes(junk), {});
  }
  assert.deepEqual(readNote({ notes: { [URL_A]: "hello" } }, URL_A), { caption: "", pins: [] });
  assert.deepEqual(readNote({ notes: { [URL_A]: { pins: "nope" } } }, URL_A), {
    caption: "",
    pins: [],
  });
});

test("a blank url can neither be read nor written", () => {
  assert.deepEqual(readNote({ notes: { "": { caption: "x" } } }, ""), { caption: "", pins: [] });
  assert.deepEqual(withImageNoteCaption({ a: 1 }, "  ", "x"), { a: 1 });
});

// ---------------------------------------------------------------------------
// The guard the whole file exists for: four different things share this map.
// ---------------------------------------------------------------------------

test("writing a note preserves the slots, the gallery and the shots beside it", () => {
  const raw = {
    flat_front: URL_A,
    sketch: "https://cdn.example.com/sketch.png",
    gallery: [{ id: "g1", url: "https://cdn.example.com/g1.jpg", caption: "" }],
    shots: [{ id: "s1", url: URL_B, caption: "as it arrived" }],
  };

  const next = withImageNoteCaption(raw, URL_A, "PPS, collar not corrected");

  assert.equal(next.flat_front, URL_A);
  assert.equal(next.sketch, "https://cdn.example.com/sketch.png");
  assert.deepEqual(next.gallery, raw.gallery);
  assert.deepEqual(next.shots, raw.shots);
  assert.equal(readNote(next, URL_A).caption, "PPS, collar not corrected");
});

test("writing one image's note leaves every other image's note alone", () => {
  let raw: unknown = {};
  raw = withImageNoteCaption(raw, URL_A, "front");
  raw = withImagePin(raw, URL_A, { id: "p1", x: 0.2, y: 0.3, text: "seam" });
  raw = withImageNoteCaption(raw, URL_B, "back");

  assert.equal(readNote(raw, URL_A).caption, "front");
  assert.equal(readNote(raw, URL_A).pins.length, 1);
  assert.equal(readNote(raw, URL_B).caption, "back");

  raw = withImagePinRemoved(raw, URL_A, "p1");
  assert.equal(readNote(raw, URL_B).caption, "back");
});

test("the source object is never mutated", () => {
  const raw = { flat_front: URL_A, notes: { [URL_A]: { caption: "one", pins: [] } } };
  const frozen = JSON.stringify(raw);
  withImageNoteCaption(raw, URL_A, "two");
  withImagePin(raw, URL_A, { id: "p", x: 0, y: 0, text: "t" });
  withImagePinRemoved(raw, URL_A, "p");
  assert.equal(JSON.stringify(raw), frozen);
});

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

test("a caption is trimmed, and blanking it clears the entry entirely", () => {
  let raw: unknown = withImageNoteCaption({}, URL_A, "  as it landed  ");
  assert.equal(readNote(raw, URL_A).caption, "as it landed");

  raw = withImageNoteCaption(raw, URL_A, "   ");
  assert.deepEqual(readNote(raw, URL_A), { caption: "", pins: [] });
  // Nothing written about any image means no annotation map at all.
  assert.equal(NOTES_KEY in (raw as Record<string, unknown>), false);
});

test("clearing a caption keeps the pins", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.1, y: 0.1, text: "here" });
  raw = withImageNoteCaption(raw, URL_A, "a line");
  raw = withImageNoteCaption(raw, URL_A, "");
  const note = readNote(raw, URL_A);
  assert.equal(note.caption, "");
  assert.deepEqual(note.pins, [{ id: "p1", x: 0.1, y: 0.1, text: "here", replies: [] }]);
});

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

test("a pin is added, then updated in place by id rather than duplicated", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "1cm too wide" });
  raw = withImagePin(raw, URL_A, { id: "p1", x: 0.45, y: 0.22, text: "2cm too wide" });

  const pins = readNote(raw, URL_A).pins;
  assert.equal(pins.length, 1);
  assert.deepEqual(pins[0], { id: "p1", x: 0.45, y: 0.22, text: "2cm too wide", replies: [] });
});

test("pins keep the order they were dropped in — that is their numbering", () => {
  let raw: unknown = {};
  raw = withImagePin(raw, URL_A, { id: "a", x: 0.9, y: 0.9, text: "third place, first mark" });
  raw = withImagePin(raw, URL_A, { id: "b", x: 0.1, y: 0.1, text: "second" });
  raw = withImagePin(raw, URL_A, { id: "c", x: 0.5, y: 0.5, text: "third" });
  assert.deepEqual(
    readNote(raw, URL_A).pins.map((p) => p.id),
    ["a", "b", "c"]
  );

  // Retyping the first one does not send it to the back of the queue.
  raw = withImagePin(raw, URL_A, { id: "a", x: 0.9, y: 0.9, text: "rewritten" });
  assert.deepEqual(
    readNote(raw, URL_A).pins.map((p) => p.id),
    ["a", "b", "c"]
  );
});

test("an empty pin survives — clearing the box to retype must not delete the mark", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.3, y: 0.3, text: "wrong" });
  raw = withImagePin(raw, URL_A, { id: "p1", x: 0.3, y: 0.3, text: "" });
  assert.equal(readNote(raw, URL_A).pins.length, 1);
  assert.equal(readNote(raw, URL_A).pins[0].text, "");
});

test("a pin with no id is refused rather than written", () => {
  assert.deepEqual(withImagePin({ a: 1 }, URL_A, { id: "  ", x: 0.5, y: 0.5, text: "x" }), { a: 1 });
});

test("removing the last pin and caption drops the image from the map", () => {
  let raw: unknown = withImagePin({ flat_front: URL_A }, URL_A, { id: "p1", x: 0, y: 0, text: "t" });
  raw = withImagePinRemoved(raw, URL_A, "p1");
  assert.deepEqual(raw, { flat_front: URL_A });
});

test("removing an unknown pin is a no-op", () => {
  const raw = withImagePin({}, URL_A, { id: "p1", x: 0.2, y: 0.2, text: "t" });
  assert.deepEqual(withImagePinRemoved(raw, URL_A, "nope"), raw);
  assert.deepEqual(withImagePinRemoved(raw, URL_A, ""), raw);
});

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

test("coordinates are clamped to the picture and rounded to four places", () => {
  const raw = withImagePin({}, URL_A, { id: "p", x: 1.8, y: -0.4, text: "" });
  assert.deepEqual(readNote(raw, URL_A).pins[0], { id: "p", x: 1, y: 0, text: "", replies: [] });

  const r2 = withImagePin({}, URL_A, { id: "p", x: 0.123456789, y: 0.987654321, text: "" });
  assert.deepEqual(readNote(r2, URL_A).pins[0], { id: "p", x: 0.1235, y: 0.9877, text: "", replies: [] });
});

test("an unreadable coordinate parks in the middle, where it looks like it needs moving", () => {
  const raw = withImagePin({}, URL_A, {
    id: "p",
    x: NaN as unknown as number,
    y: "elbow" as unknown as number,
    text: "",
  });
  assert.deepEqual(readNote(raw, URL_A).pins[0], { id: "p", x: 0.5, y: 0.5, text: "", replies: [] });
});

test("a numeric string from a hand-written row still reads as a position", () => {
  const raw = { notes: { [URL_A]: { pins: [{ id: "p", x: "0.25", y: "0.75", text: "hem" }] } } };
  assert.deepEqual(readNote(raw, URL_A).pins[0], { id: "p", x: 0.25, y: 0.75, text: "hem", replies: [] });
});

// ---------------------------------------------------------------------------
// Reading defensively — rows this app did not write
// ---------------------------------------------------------------------------

test("a pin with no id is kept and given a positional one, never dropped", () => {
  const raw = { notes: { [URL_A]: { pins: [{ x: 0.1, y: 0.1, text: "keep me" }] } } };
  const pins = readNote(raw, URL_A).pins;
  assert.equal(pins.length, 1);
  assert.equal(pins[0].text, "keep me");
  assert.ok(pins[0].id);
});

test("duplicate pin ids are made unique so React keys can never collide", () => {
  const raw = {
    notes: {
      [URL_A]: {
        pins: [
          { id: "same", x: 0.1, y: 0.1, text: "one" },
          { id: "same", x: 0.2, y: 0.2, text: "two" },
        ],
      },
    },
  };
  const pins = readNote(raw, URL_A).pins;
  assert.equal(pins.length, 2);
  assert.notEqual(pins[0].id, pins[1].id);
});

test("non-object entries in the pin list are skipped, not fatal", () => {
  const raw = {
    notes: { [URL_A]: { pins: [null, "x", 4, { id: "ok", x: 0.5, y: 0.5, text: "real" }] } },
  };
  assert.deepEqual(readNote(raw, URL_A).pins, [{ id: "ok", x: 0.5, y: 0.5, text: "real", replies: [] }]);
});

// ---------------------------------------------------------------------------
// readNotes and the labels
// ---------------------------------------------------------------------------

test("readNotes returns only images that actually have something written about them", () => {
  const raw = {
    notes: {
      [URL_A]: { caption: "a line", pins: [] },
      [URL_B]: { caption: "", pins: [] },
      "https://cdn.example.com/c.jpg": { caption: "", pins: [{ id: "p", x: 0.1, y: 0.1, text: "" }] },
    },
  };
  const all = readNotes(raw);
  assert.deepEqual(Object.keys(all).sort(), [URL_A, "https://cdn.example.com/c.jpg"].sort());
});

test("the count on the button includes the caption", () => {
  assert.equal(noteCountLabel(null), "");
  assert.equal(noteCountLabel({ caption: "", pins: [] }), "");
  assert.equal(noteCountLabel({ caption: "a", pins: [] }), "1 fit comment");
  assert.equal(noteCountLabel({ caption: "", pins: [{ id: "p", x: 0, y: 0, text: "", replies: [] }] }), "1 fit comment");
  assert.equal(
    noteCountLabel({ caption: "a", pins: [{ id: "p", x: 0, y: 0, text: "", replies: [] }] }),
    "2 fit comments"
  );
});

test("hasNote answers the only question the card asks", () => {
  assert.equal(hasNote(null), false);
  assert.equal(hasNote({ caption: "", pins: [] }), false);
  assert.equal(hasNote({ caption: "x", pins: [] }), true);
  assert.equal(hasNote({ caption: "", pins: [{ id: "p", x: 0, y: 0, text: "", replies: [] }] }), true);
});

// ---------------------------------------------------------------------------
// The reason notes are keyed by URL rather than by slot
// ---------------------------------------------------------------------------

test("re-shooting a slot gives a clean picture, and the old marks are not destroyed", () => {
  const oldUrl = "https://cdn.example.com/flat_front-v1.jpg";
  const newUrl = "https://cdn.example.com/flat_front-v2.jpg";

  let raw: unknown = { flat_front: oldUrl };
  raw = withImagePin(raw, oldUrl, { id: "p1", x: 0.4, y: 0.2, text: "shoulder 1cm too wide" });

  // The slot is replaced — the same act setStylePhoto performs.
  raw = { ...(raw as Record<string, unknown>), flat_front: newUrl };

  // The new photograph carries no claim about a fault that may have been fixed.
  assert.deepEqual(readNote(raw, newUrl), { caption: "", pins: [] });
  // And the old one still holds what was written about it.
  assert.equal(readNote(raw, oldUrl).pins[0].text, "shoulder 1cm too wide");
});

test("the same photograph carries its marks wherever it is shown", () => {
  // A picture filed in a slot and also listed in the shots strip is one
  // photograph, and one photograph has one set of marks on it.
  const raw = withImagePin({ flat_front: URL_A, shots: [{ id: "s1", url: URL_A, caption: "" }] }, URL_A, {
    id: "p1",
    x: 0.5,
    y: 0.5,
    text: "same mark, both places",
  });
  assert.equal(readNote(raw, URL_A).pins.length, 1);
});

// ---------------------------------------------------------------------------
// Replies — the thread hanging off a fit comment
// (Tess, 2026-08-17: "Reply to fit comments in thread")
// ---------------------------------------------------------------------------

test("a reply is appended to a mark's thread, carrying who and when", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "1cm too wide" });
  raw = withImagePinReply(raw, URL_A, "p1", {
    id: "r1",
    author: "kara@theloyalist.com",
    text: "corrected on the next proto",
    at: "2026-08-17T10:00:00.000Z",
  });
  const pin = readNote(raw, URL_A).pins[0];
  assert.equal(pin.replies.length, 1);
  assert.deepEqual(pin.replies[0], {
    id: "r1",
    author: "kara@theloyalist.com",
    text: "corrected on the next proto",
    at: "2026-08-17T10:00:00.000Z",
  });
});

test("replies keep the order they were written — a thread is a sequence", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "a", text: "first", author: "x", at: "1" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "b", text: "second", author: "y", at: "2" });
  assert.deepEqual(
    readNote(raw, URL_A).pins[0].replies.map((r) => r.id),
    ["a", "b"]
  );
});

test("moving or retyping a mark keeps its replies — the conversation is not the position", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "shoulder" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "r1", text: "still out", author: "x", at: "1" });
  // The pin editor only ever knows position and text; it must not blank the thread.
  raw = withImagePin(raw, URL_A, { id: "p1", x: 0.6, y: 0.3, text: "shoulder — see reply" });
  const pin = readNote(raw, URL_A).pins[0];
  assert.equal(pin.x, 0.6);
  assert.equal(pin.text, "shoulder — see reply");
  assert.equal(pin.replies.length, 1);
  assert.equal(pin.replies[0].text, "still out");
});

test("a reply to a mark that is not there changes nothing", () => {
  const raw = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" });
  assert.deepEqual(withImagePinReply(raw, URL_A, "nope", { id: "r", text: "hi", author: "x", at: "1" }), raw);
});

test("a reply with no id or no text is refused, not written", () => {
  const raw = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" });
  assert.deepEqual(withImagePinReply(raw, URL_A, "p1", { id: "", text: "hi", author: "x", at: "1" }), raw);
  assert.deepEqual(withImagePinReply(raw, URL_A, "p1", { id: "r", text: "   ", author: "x", at: "1" }), raw);
});

test("a re-sent reply id lands once, so a double-submit does not double the reply", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "r1", text: "one", author: "x", at: "1" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "r1", text: "one again", author: "x", at: "2" });
  assert.equal(readNote(raw, URL_A).pins[0].replies.length, 1);
});

test("removing a reply leaves the mark and its other replies", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "a", text: "keep", author: "x", at: "1" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "b", text: "drop", author: "x", at: "2" });
  raw = withImagePinReplyRemoved(raw, URL_A, "p1", "b");
  const pin = readNote(raw, URL_A).pins[0];
  assert.equal(pin.text, "hem");
  assert.deepEqual(pin.replies.map((r) => r.id), ["a"]);
});

test("a pin nobody has answered keeps its old four-key shape in the map", () => {
  const raw = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" }) as Record<string, unknown>;
  const stored = (raw[NOTES_KEY] as Record<string, { pins: Record<string, unknown>[] }>)[URL_A].pins[0];
  assert.deepEqual(Object.keys(stored).sort(), ["id", "text", "x", "y"]);
  assert.ok(!("replies" in stored));
});

test("a reply with no text stored by hand is dropped on read", () => {
  const raw = {
    notes: {
      [URL_A]: {
        pins: [{ id: "p", x: 0.1, y: 0.1, text: "hem", replies: [{ id: "r", text: "" }, { id: "s", text: "real" }] }],
      },
    },
  };
  const replies = readNote(raw, URL_A).pins[0].replies;
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, "s");
});

test("writing a reply leaves the slots and the gallery beside it untouched", () => {
  const base = {
    flat_front: URL_A,
    gallery: [{ id: "g1", url: URL_B, caption: "a shot" }],
  };
  let raw: unknown = withImagePin(base, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" });
  raw = withImagePinReply(raw, URL_A, "p1", { id: "r1", text: "reply", author: "x", at: "1" });
  const out = raw as Record<string, unknown>;
  assert.equal(out.flat_front, URL_A);
  assert.deepEqual(out.gallery, [{ id: "g1", url: URL_B, caption: "a shot" }]);
});

test("neither reply writer mutates the source object", () => {
  const raw = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "hem" });
  const before = JSON.stringify(raw);
  withImagePinReply(raw, URL_A, "p1", { id: "r", text: "hi", author: "x", at: "1" });
  withImagePinReplyRemoved(raw, URL_A, "p1", "r");
  assert.equal(JSON.stringify(raw), before);
});
