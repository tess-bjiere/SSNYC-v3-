import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTES_KEY,
  readNote,
  readNotes,
  withImageNoteCaption,
  withImagePin,
  withImagePinRemoved,
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
  assert.deepEqual(note.pins, [{ id: "p1", x: 0.1, y: 0.1, text: "here" }]);
});

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

test("a pin is added, then updated in place by id rather than duplicated", () => {
  let raw: unknown = withImagePin({}, URL_A, { id: "p1", x: 0.4, y: 0.2, text: "1cm too wide" });
  raw = withImagePin(raw, URL_A, { id: "p1", x: 0.45, y: 0.22, text: "2cm too wide" });

  const pins = readNote(raw, URL_A).pins;
  assert.equal(pins.length, 1);
  assert.deepEqual(pins[0], { id: "p1", x: 0.45, y: 0.22, text: "2cm too wide" });
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
  assert.deepEqual(readNote(raw, URL_A).pins[0], { id: "p", x: 1, y: 0, text: "" });

  const r2 = withImagePin({}, URL_A, { id: "p", x: 0.123456789, y: 0.987654321, text: "" });
  assert.deepEqual(readNote(r2, URL_A).pins[0], { id: "p", x: 0.1235, y: 0.9877, text: "" });
});

test("an unreadable coordinate parks in the middle, where it looks like it needs moving", () => {
  const raw = withImagePin({}, URL_A, {
    id: "p",
    x: NaN as unknown as number,
    y: "elbow" as unknown as number,
    text: "",
  });
  assert.deepEqual(readNote(raw, URL_A).pins[0], { id: "p", x: 0.5, y: 0.5, text: "" });
});

test("a numeric string from a hand-written row still reads as a position", () => {
  const raw = { notes: { [URL_A]: { pins: [{ id: "p", x: "0.25", y: "0.75", text: "hem" }] } } };
  assert.deepEqual(readNote(raw, URL_A).pins[0], { id: "p", x: 0.25, y: 0.75, text: "hem" });
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
  assert.deepEqual(readNote(raw, URL_A).pins, [{ id: "ok", x: 0.5, y: 0.5, text: "real" }]);
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
  assert.equal(noteCountLabel({ caption: "", pins: [{ id: "p", x: 0, y: 0, text: "" }] }), "1 fit comment");
  assert.equal(
    noteCountLabel({ caption: "a", pins: [{ id: "p", x: 0, y: 0, text: "" }] }),
    "2 fit comments"
  );
});

test("hasNote answers the only question the card asks", () => {
  assert.equal(hasNote(null), false);
  assert.equal(hasNote({ caption: "", pins: [] }), false);
  assert.equal(hasNote({ caption: "x", pins: [] }), true);
  assert.equal(hasNote({ caption: "", pins: [{ id: "p", x: 0, y: 0, text: "" }] }), true);
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
