import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PHOTO_SLOTS,
  isPhotoSlot,
  photoSlot,
  normalizePhotos,
  withPhoto,
  photoProgress,
  photoProgressLabel,
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
  assert.equal(p0.total, PHOTO_SLOTS.length);
  assert.equal(p0.complete, false);
  assert.deepEqual(p0.missing, PHOTO_SLOTS.map((s) => s.id));

  const p1 = photoProgress({ model_back: "https://x/b.jpg" });
  assert.equal(p1.filled, 1);
  assert.equal(p1.missing.includes("model_back"), false);
  assert.equal(p1.missing[0], PHOTO_SLOTS[0].id);
});

test("progress reports complete only when every slot is filled", () => {
  const full: Record<string, string> = {};
  for (const s of PHOTO_SLOTS) full[s.id] = `https://x/${s.id}.jpg`;
  const p = photoProgress(full);
  assert.equal(p.complete, true);
  assert.deepEqual(p.missing, []);
  assert.equal(photoProgressLabel(full), "Complete");
});

test("the progress label reads plainly at each stage", () => {
  assert.match(photoProgressLabel({}), /^Not shot/);
  assert.equal(photoProgressLabel({ model_front: "https://x/a.jpg" }), `1 of ${PHOTO_SLOTS.length} shot`);
});
