import { test } from "node:test";
import assert from "node:assert/strict";
import {
  photoNoteEntries,
  countPhotoNotes,
  filterPhotoNotes,
  photoNoteCountLabel,
  feedbackCountLabel,
  type PhotoNoteEntry,
} from "./photoNotes.ts";
import { readNotes, withImageNoteCaption, withImagePin } from "./imageNotes.ts";

const FRONT = "https://cdn.example.com/styles/a/flat_front.jpg";
const BACK = "https://cdn.example.com/styles/a/flat_back.jpg";
const SHOT = "https://cdn.example.com/samples/r1/shot-2.jpg";

const ORDER = [
  { url: FRONT, label: "Lay flat — front" },
  { url: BACK, label: "Lay flat — back" },
  { url: SHOT, label: "Shot 2" },
];

test("a set of pictures nobody has written on produces nothing to read", () => {
  assert.deepEqual(photoNoteEntries(ORDER, {}), []);
  assert.deepEqual(photoNoteEntries(ORDER, null), []);
  assert.deepEqual(photoNoteEntries(ORDER, undefined), []);
  assert.deepEqual(photoNoteEntries([], { [FRONT]: { caption: "hi" } }), []);
});

test("what the drawer shows is what the viewer stored, marks numbered as they are on the picture", () => {
  // Written the way the app writes it: through the real writers, into a photos
  // map that also holds the slots — so this is the shape that actually lands.
  let photos: unknown = { flat_front: FRONT, flat_back: BACK };
  photos = withImageNoteCaption(photos, FRONT, "PPS, collar not yet corrected");
  photos = withImagePin(photos, FRONT, { id: "p1", x: 0.4, y: 0.2, text: "1cm too wide" });
  photos = withImagePin(photos, FRONT, { id: "p2", x: 0.6, y: 0.8, text: "hem puckering" });
  photos = withImagePin(photos, SHOT, { id: "p9", x: 0.5, y: 0.5, text: "wrong thread" });

  const entries = photoNoteEntries(ORDER, readNotes(photos), "round-1");

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    sampleId: "round-1",
    url: FRONT,
    label: "Lay flat — front",
    caption: "PPS, collar not yet corrected",
    pins: [
      { n: 1, text: "1cm too wide" },
      { n: 2, text: "hem puckering" },
    ],
    count: 3,
  } satisfies PhotoNoteEntry);
  // The back was never written on, so it is not in the list at all — and the
  // shot keeps its own place in the order rather than being pulled to the top.
  assert.deepEqual(
    entries.map((e) => e.url),
    [FRONT, SHOT]
  );
  assert.equal(entries[1].caption, "");
  assert.deepEqual(entries[1].pins, [{ n: 1, text: "wrong thread" }]);
  assert.equal(countPhotoNotes(entries), 4);
});

test("the pictures keep the order they are in on the page", () => {
  const notes = {
    [FRONT]: { caption: "a" },
    [BACK]: { caption: "b" },
    [SHOT]: { caption: "c" },
  };
  assert.deepEqual(
    photoNoteEntries(ORDER, notes).map((e) => e.label),
    ["Lay flat — front", "Lay flat — back", "Shot 2"]
  );
  // Reversed on the page, reversed in the drawer. The list is not sorted, it
  // is walked.
  assert.deepEqual(
    photoNoteEntries([...ORDER].reverse(), notes).map((e) => e.label),
    ["Shot 2", "Lay flat — back", "Lay flat — front"]
  );
});

test("one file filed in two places is one note, not two", () => {
  const order = [
    { url: FRONT, label: "Lay flat — front" },
    { url: FRONT, label: "Shot 1" },
  ];
  const entries = photoNoteEntries(order, { [FRONT]: { caption: "same file" } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, "Lay flat — front");
});

test("a blank mark is not printed, and a picture holding only blank marks is not listed", () => {
  const entries = photoNoteEntries(ORDER, {
    [FRONT]: { caption: "", pins: [{ text: "" }, { text: "the second one says something" }] },
    [BACK]: { caption: "   ", pins: [{ text: "  " }] },
  });
  assert.equal(entries.length, 1);
  // Still mark two: the number is what is drawn on the photograph, so it is
  // the number here, blank first mark or not.
  assert.deepEqual(entries[0].pins, [{ n: 2, text: "the second one says something" }]);
  assert.equal(entries[0].count, 1);
});

test("garbage never throws and never invents a note", () => {
  for (const junk of [null, undefined, 0, "", "notes", [], { pins: "nope" }, { pins: [7, null] }]) {
    const entries = photoNoteEntries(ORDER, { [FRONT]: junk as never });
    assert.deepEqual(entries, []);
  }
  assert.deepEqual(photoNoteEntries([{ url: "  ", label: "x" }], { "  ": { caption: "y" } }), []);
});

test("a picture with no name is still a picture", () => {
  const entries = photoNoteEntries([{ url: FRONT, label: "" }], { [FRONT]: { caption: "y" } });
  assert.equal(entries[0].label, "Photograph");
});

test("the scope chips filter the photograph notes the same way they filter comments", () => {
  const style = photoNoteEntries([{ url: FRONT, label: "Sketch" }], { [FRONT]: { caption: "s" } });
  const r1 = photoNoteEntries([{ url: BACK, label: "Lay flat — back" }], { [BACK]: { caption: "b" } }, "r1");
  const r2 = photoNoteEntries([{ url: SHOT, label: "Shot 2" }], { [SHOT]: { caption: "c" } }, "r2");
  const all = [...style, ...r1, ...r2];

  assert.equal(filterPhotoNotes(all, "all").length, 3);
  assert.deepEqual(
    filterPhotoNotes(all, "general").map((e) => e.url),
    [FRONT]
  );
  assert.deepEqual(
    filterPhotoNotes(all, "r1").map((e) => e.url),
    [BACK]
  );
  assert.deepEqual(filterPhotoNotes(all, "nobody"), []);
  // Filtering never hands back the array it was given, so a caller sorting or
  // splicing the result cannot reorder the page's own list.
  assert.notEqual(filterPhotoNotes(all, "all"), all);
});

test("the count says what it counts", () => {
  assert.equal(photoNoteCountLabel([]), "");
  assert.equal(
    photoNoteCountLabel(photoNoteEntries([{ url: FRONT, label: "x" }], { [FRONT]: { caption: "one" } })),
    "1 fit comment"
  );
  assert.equal(
    photoNoteCountLabel(
      photoNoteEntries(ORDER, {
        [FRONT]: { caption: "one", pins: [{ text: "two" }] },
        [SHOT]: { pins: [{ text: "three" }] },
      })
    ),
    "3 fit comments"
  );
});

test("one line for both kinds of feedback, so neither can contradict the other", () => {
  const one = photoNoteEntries([{ url: FRONT, label: "x" }], { [FRONT]: { caption: "one" } });
  const three = photoNoteEntries(ORDER, {
    [FRONT]: { caption: "one", pins: [{ text: "two" }] },
    [SHOT]: { pins: [{ text: "three" }] },
  });

  // The case that started this: a round nobody has typed about, whose
  // photographs have been written on. It must not read "No comments".
  assert.equal(feedbackCountLabel(0, one), "1 fit comment");
  assert.equal(feedbackCountLabel(0, three), "3 fit comments");

  // Both present: both named, one line, one reading.
  assert.equal(feedbackCountLabel(3, three), "3 general comments · 3 fit comments");
  assert.equal(feedbackCountLabel(1, one), "1 general comment · 1 fit comment");

  // Conversation only.
  assert.equal(feedbackCountLabel(2, []), "2 general comments");
  assert.equal(feedbackCountLabel(1, []), "1 general comment");

  // Genuinely empty says so about the whole drawer, not about half of it.
  assert.equal(feedbackCountLabel(0, []), "Nothing yet");
  // Nonsense in never prints nonsense out.
  assert.equal(feedbackCountLabel(-4, []), "Nothing yet");
});
