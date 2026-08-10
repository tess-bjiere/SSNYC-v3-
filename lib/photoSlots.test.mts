import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PHOTO_SLOTS,
  REQUIRED_SLOTS,
  DESIGN_SLOTS,
  ALL_SLOTS,
  writePhotos,
  isPhotoSlot,
  photoSlot,
  normalizePhotos,
  withPhoto,
  photoProgress,
  photoProgressLabel,
  visibleSlots,
} from "./photoSlots.ts";

test("the standard defines the front, back and lay-flat shots the plan calls for", () => {
  const ids = PHOTO_SLOTS.map((s) => s.id);
  assert.ok(ids.includes("model_front"));
  assert.ok(ids.includes("model_back"));
  assert.ok(ids.includes("flat_front"));
  // Every slot carries a shooting note — a slot without one is not a standard.
  for (const s of PHOTO_SLOTS) {
    assert.ok(s.label.length > 0, `${s.id} has no label`);
    assert.ok(s.hint.length > 0, `${s.id} has no hint`);
  }
  // Ids are unique, or the jsonb map would silently collide.
  assert.equal(new Set(ids).size, ids.length);
});

test("slot lookup only recognises defined slots", () => {
  assert.equal(isPhotoSlot("model_front"), true);
  assert.equal(isPhotoSlot("selfie"), false);
  assert.equal(photoSlot("model_back")?.label, "Model — back");
  assert.equal(photoSlot("nope"), null);
});

test("normalizePhotos survives everything jsonb can hand back", () => {
  assert.deepEqual(normalizePhotos(null), {});
  assert.deepEqual(normalizePhotos(undefined), {});
  assert.deepEqual(normalizePhotos({}), {});
  assert.deepEqual(normalizePhotos("not an object"), {});
  assert.deepEqual(normalizePhotos([1, 2]), {});
  assert.deepEqual(normalizePhotos({ model_front: 42 }), {});
});

test("normalizePhotos drops blanks and slots the standard no longer defines", () => {
  const out = normalizePhotos({
    model_front: " https://x/a.jpg ",
    model_back: "   ",
    retired_slot: "https://x/old.jpg",
  });
  assert.deepEqual(out, { model_front: "https://x/a.jpg" });
});

test("withPhoto sets, trims and clears", () => {
  const a = withPhoto({}, "model_front", "  https://x/a.jpg ");
  assert.deepEqual(a, { model_front: "https://x/a.jpg" });

  const b = withPhoto(a, "model_front", "");
  assert.deepEqual(b, {});

  const c = withPhoto(a, "model_front", null);
  assert.deepEqual(c, {});
});

test("withPhoto ignores a slot the standard does not define", () => {
  const out = withPhoto({ model_front: "https://x/a.jpg" }, "selfie", "https://x/b.jpg");
  assert.deepEqual(out, { model_front: "https://x/a.jpg" });
});

test("withPhoto never mutates the map it is given", () => {
  const before = { model_front: "https://x/a.jpg" };
  const snapshot = { ...before };
  withPhoto(before, "flat_front", "https://x/b.jpg");
  withPhoto(before, "model_front", "");
  assert.deepEqual(before, snapshot);
});

test("progress is the shot list, in standard order", () => {
  const p0 = photoProgress({});
  assert.equal(p0.filled, 0);
  assert.equal(p0.total, REQUIRED_SLOTS.length);
  assert.equal(p0.complete, false);
  assert.deepEqual(p0.missing, REQUIRED_SLOTS.map((s) => s.id));

  const p1 = photoProgress({ model_back: "https://x/b.jpg" });
  assert.equal(p1.filled, 1);
  assert.equal(p1.missing.includes("model_back"), false);
  assert.equal(p1.missing[0], REQUIRED_SLOTS[0].id);
});

test("progress reports complete only when every required slot is filled", () => {
  const full: Record<string, string> = {};
  for (const s of REQUIRED_SLOTS) full[s.id] = `https://x/${s.id}.jpg`;
  const p = photoProgress(full);
  assert.equal(p.complete, true);
  assert.deepEqual(p.missing, []);
  assert.equal(photoProgressLabel(full), "");
});

test("the progress label reads plainly at each stage", () => {
  assert.match(photoProgressLabel({}), /^Not shot/);
  assert.equal(photoProgressLabel({ model_front: "https://x/a.jpg" }), `1 of ${REQUIRED_SLOTS.length} shot`);
});

// ---------------------------------------------------------------------------
// The side shot and the second detail (Tess, 2026-08-05).
// ---------------------------------------------------------------------------

test("the side shot is part of the standard", () => {
  // Three views on a body, not two. A style shot before today reads one short,
  // which is the shot list telling the truth rather than a regression.
  const ids = PHOTO_SLOTS.map((s) => s.id);
  assert.ok(ids.includes("model_side"));
  assert.ok(REQUIRED_SLOTS.map((s) => s.id).includes("model_side"));
  assert.equal(photoSlot("model_side")?.label, "Model — side");
  assert.equal(isPhotoSlot("model_side"), true);
});

test("the second detail is a slot but not a duty", () => {
  // "Additional" was the word. It stores, reads and shows like any other slot;
  // it simply cannot make a style late.
  assert.equal(isPhotoSlot("detail_2"), true);
  assert.equal(photoSlot("detail_2")?.optional, true);
  assert.equal(REQUIRED_SLOTS.map((s) => s.id).includes("detail_2"), false);

  const full: Record<string, string> = {};
  for (const s of REQUIRED_SLOTS) full[s.id] = `https://x/${s.id}.jpg`;
  assert.equal(photoProgress(full).complete, true);
  assert.equal(photoProgress(full).missing.includes("detail_2"), false);

  // And shooting it is never held against the count either way.
  const withExtra = { ...full, detail_2: "https://x/d2.jpg" };
  assert.equal(photoProgress(withExtra).filled, REQUIRED_SLOTS.length);
  assert.equal(photoProgressLabel(withExtra), "");
});

test("an optional shot is still stored, read and written like any other", () => {
  // The whole risk of an "optional" flag is that it quietly becomes a second
  // class of data. It does not: normalize keeps it, withPhoto sets and clears
  // it, and writePhotos carries the rest of the map through untouched.
  assert.deepEqual(normalizePhotos({ detail_2: " https://x/d2.jpg " }), {
    detail_2: "https://x/d2.jpg",
  });
  assert.deepEqual(withPhoto({}, "detail_2", "https://x/d2.jpg"), { detail_2: "https://x/d2.jpg" });
  assert.deepEqual(withPhoto({ detail_2: "https://x/d2.jpg" }, "detail_2", ""), {});
  const raw = writePhotos({ gallery: [{ id: "g1" }], notes: { a: 1 } }, "detail_2", "https://x/d2.jpg");
  assert.equal(raw.detail_2, "https://x/d2.jpg");
  assert.deepEqual(raw.gallery, [{ id: "g1" }]);
  assert.deepEqual(raw.notes, { a: 1 });
});

test("REQUIRED_SLOTS is the shoot list minus the optional ones, in order", () => {
  assert.deepEqual(
    REQUIRED_SLOTS.map((s) => s.id),
    PHOTO_SLOTS.filter((s) => !s.optional).map((s) => s.id)
  );
  assert.ok(REQUIRED_SLOTS.length < PHOTO_SLOTS.length);
});

// ---------------------------------------------------------------------------
// The sketch, and writing through the raw jsonb (P3 refinements).
// ---------------------------------------------------------------------------

test("the sketch is a slot but not a shot", () => {
  // A sketch exists before the garment does. It must never make a style read as
  // an unfinished shoot.
  const designIds = DESIGN_SLOTS.map((s) => s.id);
  const shootIds = PHOTO_SLOTS.map((s) => s.id);
  assert.deepEqual(designIds, ["sketch", "sketch_back"]);
  for (const id of designIds) assert.equal(shootIds.includes(id), false);
  assert.equal(isPhotoSlot("sketch"), true);
  assert.equal(isPhotoSlot("sketch_back"), true);
  for (const s of DESIGN_SLOTS) assert.ok(s.hint.length > 0, `${s.id} has no hint`);
});

test("the sketch front keeps the id it has always had", () => {
  // Every sketch already drawn is stored under "sketch". Renaming it to
  // "sketch_front" when the back arrived would have meant a migration or a
  // silent disappearance — the label changed, the key did not. It has since
  // changed again, to plain "Front" and "Back" under the Sketch heading, which
  // is exactly the point: the label is copy and moves freely, the id does not
  // move at all.
  assert.equal(photoSlot("sketch")?.label, "Front");
  assert.equal(photoSlot("sketch_back")?.label, "Back");
  assert.equal(normalizePhotos({ sketch: "https://draw/old.png" }).sketch, "https://draw/old.png");
});

test("a sketch alone leaves the shot list untouched", () => {
  const p = photoProgress(normalizePhotos({ sketch: "https://draw/1.png", sketch_back: "https://draw/2.png" }));
  assert.equal(p.filled, 0);
  assert.equal(p.total, REQUIRED_SLOTS.length);
  assert.equal(p.missing.includes("sketch"), false);
  assert.equal(p.missing.includes("sketch_back"), false);

  const full: Record<string, string> = { sketch: "https://draw/1.png" };
  for (const s of REQUIRED_SLOTS) full[s.id] = `https://x/${s.id}.jpg`;
  assert.equal(photoProgressLabel(full), "");
});

test("ALL_SLOTS is the shoot plus the design slots, with no id used twice", () => {
  assert.equal(ALL_SLOTS.length, PHOTO_SLOTS.length + DESIGN_SLOTS.length);
  const ids = ALL_SLOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  // A sketch is read back out of the map like any other slot.
  assert.equal(normalizePhotos({ sketch: " https://draw/1.png " }).sketch, "https://draw/1.png");
});

test("writePhotos keeps every key it did not come for", () => {
  // This is the data-loss guard. The slots and the image galleries share one
  // jsonb column, and writing a normalised map back would have deleted the
  // galleries every time somebody replaced a single photograph.
  const raw = {
    model_front: "https://shot/front.jpg",
    gallery: [{ id: "g1", url: "https://a/1.jpg" }],
    shots: [{ id: "s1", url: "https://a/2.jpg" }],
    something_a_later_version_added: { keep: true },
  };
  const next = writePhotos(raw, "flat_front", "https://shot/flat.jpg");
  assert.equal(next.flat_front, "https://shot/flat.jpg");
  assert.equal(next.model_front, "https://shot/front.jpg");
  assert.deepEqual(next.gallery, raw.gallery);
  assert.deepEqual(next.shots, raw.shots);
  assert.deepEqual(next.something_a_later_version_added, { keep: true });
});

test("writePhotos clearing a slot removes only that slot", () => {
  const raw = { model_front: "https://shot/front.jpg", gallery: [{ id: "g1", url: "https://a/1.jpg" }] };
  const next = writePhotos(raw, "model_front", "");
  assert.equal(Object.prototype.hasOwnProperty.call(next, "model_front"), false);
  assert.deepEqual(next.gallery, raw.gallery);
  // Whitespace is the same as blank — "cleared" and "never shot" are one state.
  assert.equal(Object.prototype.hasOwnProperty.call(writePhotos(raw, "model_front", "   "), "model_front"), false);
});

test("writePhotos trims, refuses an invented key, and never mutates", () => {
  const raw: Record<string, unknown> = { gallery: [] };
  const snapshot = JSON.stringify(raw);

  assert.equal(writePhotos(raw, "detail", "  https://shot/d.jpg  ").detail, "https://shot/d.jpg");

  const forged = writePhotos(raw, "../../etc/passwd", "https://evil");
  assert.equal(Object.prototype.hasOwnProperty.call(forged, "../../etc/passwd"), false);
  assert.deepEqual(forged, { gallery: [] });

  assert.equal(JSON.stringify(raw), snapshot);
});

test("writePhotos copes with whatever jsonb hands back", () => {
  for (const raw of [null, undefined, "nonsense", 7, ["a"]]) {
    const next = writePhotos(raw, "detail", "https://shot/d.jpg");
    assert.deepEqual(next, { detail: "https://shot/d.jpg" });
  }
});

// Four details and two pairs of flats (Tess, 2026-08-05: "have 4 detail shots
// and 2 then 2 layflat shots"). The point of these tests is that the standard
// grew without the shot list growing: nothing a style is measured against
// changed, and the extra cards only appear as they are used.

test("there is a named place for eight details and one pair of lay flats", () => {
  // Tess, 2026-08-05: "second layflat options should just be detial shots".
  // Two more added 2026-08-06: "add slot for 2 more detial shots in sample
  // images" — spare like all the rest, so the standard is unmoved.
  const ids = PHOTO_SLOTS.map((s) => s.id);
  for (const id of [
    "detail",
    "detail_2",
    "detail_3",
    "detail_4",
    "detail_5",
    "detail_6",
    "detail_7",
    "detail_8",
  ])
    assert.ok(ids.includes(id), id);
  assert.equal(PHOTO_SLOTS.filter((s) => s.group === "detail").length, 8);
  // The second pair is still defined — retired, not deleted — so a round that
  // already has one is unaffected. What changed is that it is never offered.
  const liveFlats = PHOTO_SLOTS.filter((s) => s.group === "flat" && !s.retired);
  assert.deepEqual(liveFlats.map((s) => s.id), ["flat_front", "flat_back"]);
});

test("growing the standard did not grow what a style is measured against", () => {
  // One detail, one pair of flats, three model shots. Everything added is spare.
  assert.deepEqual(REQUIRED_SLOTS.map((s) => s.id), [
    "model_front",
    "model_back",
    "model_side",
    "flat_front",
    "flat_back",
    "detail",
  ]);
  const shot: Record<string, string> = {};
  for (const s of REQUIRED_SLOTS) shot[s.id] = `https://x/${s.id}.jpg`;
  assert.equal(photoProgress(shot).complete, true);
  assert.equal(photoProgressLabel(shot), "");
});

test("an empty round offers one spare detail and no spare flats", () => {
  const ids = visibleSlots(PHOTO_SLOTS, {}).map((s) => s.id);
  assert.deepEqual(ids, [
    "model_front",
    "model_back",
    "model_side",
    "flat_front",
    "flat_back",
    "detail",
    "detail_2",
  ]);
  // Seven cards, not fifteen — nothing beyond the next spare detail is offered,
  // and the retired second lay flat is not offered at all.
  for (const id of [
    "flat2_front",
    "flat2_back",
    "detail_3",
    "detail_4",
    "detail_5",
    "detail_6",
    "detail_7",
    "detail_8",
  ])
    assert.ok(!ids.includes(id), id);
});

test("filling a spare detail offers the next one, and only the next one", () => {
  const one = visibleSlots(PHOTO_SLOTS, { detail_2: "https://x/d2.jpg" }).map((s) => s.id);
  assert.ok(one.includes("detail_2"));
  assert.ok(one.includes("detail_3"));
  assert.ok(!one.includes("detail_4"));

  const two = visibleSlots(PHOTO_SLOTS, {
    detail_2: "https://x/d2.jpg",
    detail_3: "https://x/d3.jpg",
  }).map((s) => s.id);
  assert.ok(two.includes("detail_4"));
  assert.ok(!two.includes("detail_5"));

  // Filling every live spare shows everything except the retired pair.
  const all = visibleSlots(PHOTO_SLOTS, {
    detail_2: "https://x/d2.jpg",
    detail_3: "https://x/d3.jpg",
    detail_4: "https://x/d4.jpg",
    detail_5: "https://x/d5.jpg",
    detail_6: "https://x/d6.jpg",
    detail_7: "https://x/d7.jpg",
  }).map((s) => s.id);
  assert.ok(all.includes("detail_8"));
  assert.equal(all.length, PHOTO_SLOTS.length - 2);
});

test("a second lay flat already shot still shows, and is never offered again", () => {
  // Tess, 2026-08-05: "second layflat options should just be detial shots".
  // Nothing is deleted here, only stopped being offered — a round photographed
  // yesterday keeps every picture on it.
  const empty = visibleSlots(PHOTO_SLOTS, {}).map((s) => s.id);
  assert.ok(!empty.includes("flat2_front") && !empty.includes("flat2_back"));

  // And a picture already filed in one is never hidden. Its partner comes back
  // with it, because a lay flat is a front and a back or it is nothing.
  const half = visibleSlots(PHOTO_SLOTS, { flat2_front: "https://x/f2.jpg" }).map((s) => s.id);
  assert.ok(half.includes("flat2_front") && half.includes("flat2_back"));

  // Retiring a slot must not cost the family its one open offer.
  assert.ok(empty.includes("detail_2"));
});

test("a retired slot still stores, reads and writes like any other", () => {
  for (const id of ["flat2_front", "flat2_back"]) {
    assert.equal(isPhotoSlot(id), true, id);
    assert.ok(photoSlot(id));
    assert.equal(normalizePhotos({ [id]: ` https://x/${id}.jpg ` })[id], `https://x/${id}.jpg`);
    assert.equal(writePhotos({}, id, `https://x/${id}.jpg`)[id], `https://x/${id}.jpg`);
  }
});

test("a picture is never hidden, whatever order the slots were filled in", () => {
  // Somebody fills the fourth detail first — the card holding it still shows,
  // and the offer of the next empty one is still exactly one card.
  const ids = visibleSlots(PHOTO_SLOTS, { detail_4: "https://x/d4.jpg" }).map((s) => s.id);
  assert.ok(ids.includes("detail_4"));
  assert.ok(ids.includes("detail_2"));
  assert.ok(!ids.includes("detail_3"));
});

test("visibleSlots leaves a list with no optional slots alone", () => {
  assert.deepEqual(visibleSlots(DESIGN_SLOTS, {}), [...DESIGN_SLOTS]);
  assert.deepEqual(
    visibleSlots(REQUIRED_SLOTS, {}).map((s) => s.id),
    REQUIRED_SLOTS.map((s) => s.id)
  );
  // And it never invents or reorders — the result is always a subset in order.
  const out = visibleSlots(PHOTO_SLOTS, {});
  const order = PHOTO_SLOTS.map((s) => s.id);
  assert.deepEqual(
    out.map((s) => s.id),
    order.filter((id) => out.some((s) => s.id === id))
  );
});

test("every new slot stores, reads and writes like any other", () => {
  for (const id of [
    "flat2_front",
    "flat2_back",
    "detail_3",
    "detail_4",
    "detail_5",
    "detail_6",
    "detail_7",
    "detail_8",
  ]) {
    assert.equal(isPhotoSlot(id), true, id);
    assert.ok(photoSlot(id));
    assert.equal(normalizePhotos({ [id]: ` https://x/${id}.jpg ` })[id], `https://x/${id}.jpg`);
    assert.equal(withPhoto({}, id, `https://x/${id}.jpg`)[id], `https://x/${id}.jpg`);
    const kept = writePhotos({ gallery: [{ id: "g1" }] }, id, `https://x/${id}.jpg`);
    assert.equal(kept[id], `https://x/${id}.jpg`);
    assert.deepEqual(kept.gallery, [{ id: "g1" }]);
  }
});
