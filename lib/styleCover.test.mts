import test from "node:test";
import assert from "node:assert/strict";
import {
  FACE_FAMILIES,
  faceSlotIds,
  styleCoverLabel,
  styleCoverUrl,
  styleFaces,
  withRoundPhotos,
} from "./styleCover.ts";
import { ALL_SLOTS } from "./photoSlots.ts";

// The face of a style (Tess, 2026-08-05: "the sketch or flat should be the
// profile picture of the style. You should be able to add front and back
// images").
//
// The rule these tests exist to pin: the drawing wins over the photograph of
// somebody else's garment, and a front/back pair always comes from one family.

const SKETCH = "https://draw/front.png";
const SKETCH_BACK = "https://draw/back.png";
const FLAT = "https://shot/flat-front.jpg";
const FLAT_BACK = "https://shot/flat-back.jpg";
const MODEL = "https://shot/model-front.jpg";
const COVER = "https://library/reference.jpg";

test("the sketch is the profile picture, ahead of any photograph", () => {
  const f = styleFaces({
    cover_image: COVER,
    photos: { sketch: SKETCH, flat_front: FLAT, model_front: MODEL },
  });
  assert.equal(f.front?.url, SKETCH);
  assert.equal(f.front?.label, "Sketch — front");
  assert.equal(f.family, "sketch");
  assert.equal(f.source, "family");
  assert.equal(styleCoverUrl({ cover_image: COVER, photos: { sketch: SKETCH } }), SKETCH);
});

test("the lay flat is the profile picture when nothing is drawn", () => {
  const f = styleFaces({ cover_image: COVER, photos: { flat_front: FLAT, model_front: MODEL } });
  assert.equal(f.front?.url, FLAT);
  assert.equal(f.family, "flat");
  assert.equal(styleCoverLabel({ photos: { flat_front: FLAT } }), "Lay flat — front");
});

test("the model shot is the profile picture when there is no drawing and no flat", () => {
  const f = styleFaces({ cover_image: COVER, photos: { model_front: MODEL, detail: "https://shot/zip.jpg" } });
  assert.equal(f.front?.url, MODEL);
  assert.equal(f.family, "model");
});

test("a detail shot never becomes the face", () => {
  // A close-up of a zip identifies nothing in a grid. It is a picture of a
  // style, not a picture that is one.
  const f = styleFaces({ cover_image: null, photos: { detail: "https://shot/zip.jpg" } });
  assert.equal(f.source, "none");
  assert.equal(f.front, null);
  assert.equal(styleCoverUrl({ photos: { detail: "https://shot/zip.jpg" } }), null);
});

test("cover_image is the fallback, not the default — and it still works", () => {
  // The one that guards every style that existed before this change. Nothing
  // drawn, nothing shot: the profile looks exactly as it did yesterday.
  const f = styleFaces({ cover_image: COVER, photos: null });
  assert.equal(f.front?.url, COVER);
  assert.equal(f.front?.slotId, "cover_image");
  assert.equal(f.front?.label, "Cover image");
  assert.equal(f.source, "cover");
  assert.equal(f.back, null);
});

test("front and back always come from the same family", () => {
  // A sketched front beside a photographed back reads as two garments. If the
  // family that supplied the front has no back yet, there is no back.
  const f = styleFaces({
    photos: { sketch: SKETCH, flat_front: FLAT, flat_back: FLAT_BACK, model_back: "https://shot/m-back.jpg" },
  });
  assert.equal(f.front?.url, SKETCH);
  assert.equal(f.back, null, "must not borrow the flat's back for the sketch's front");

  const pair = styleFaces({ photos: { sketch: SKETCH, sketch_back: SKETCH_BACK, flat_back: FLAT_BACK } });
  assert.equal(pair.front?.url, SKETCH);
  assert.equal(pair.back?.url, SKETCH_BACK);
  assert.equal(pair.back?.label, "Sketch — back");
  assert.equal(pair.back?.side, "back");
});

test("a back drawn before the front still shows the style", () => {
  // Somebody who has drawn only the back has still drawn this style. Showing
  // the reference photograph instead would be showing a different garment.
  const f = styleFaces({ cover_image: COVER, photos: { sketch_back: SKETCH_BACK } });
  assert.equal(f.family, "sketch");
  assert.equal(f.front, null);
  assert.equal(f.back?.url, SKETCH_BACK);
  assert.equal(styleCoverUrl(f2(SKETCH_BACK)), SKETCH_BACK);
  assert.equal(styleCoverLabel(f2(SKETCH_BACK)), "Sketch — back");
});
function f2(url: string) {
  return { cover_image: COVER, photos: { sketch_back: url } };
}

test("nothing anywhere is nothing, not a crash", () => {
  for (const s of [null, undefined, {}, { cover_image: null, photos: null }, { cover_image: "  ", photos: {} }]) {
    const f = styleFaces(s as never);
    assert.equal(f.source, "none");
    assert.equal(styleCoverUrl(s as never), null);
    assert.equal(styleCoverLabel(s as never), null);
  }
});

test("the jsonb is read defensively, whatever is actually in it", () => {
  // photos is shared with the gallery list and has been written by several
  // versions of this app. Arrays, numbers, blanks and unknown keys are absent,
  // never a thrown error and never a broken <img src="">.
  assert.equal(styleCoverUrl({ photos: [1, 2, 3] as unknown }), null);
  assert.equal(styleCoverUrl({ photos: "not an object" as unknown }), null);
  assert.equal(styleCoverUrl({ photos: { sketch: 42 as unknown as string } }), null);
  assert.equal(styleCoverUrl({ photos: { sketch: "   " } }), null);
  assert.equal(styleCoverUrl({ photos: { sketch: `  ${SKETCH}  ` } }), SKETCH);
  // The gallery lives in the same map as an array of objects. It is not a face.
  assert.equal(styleCoverUrl({ photos: { gallery: [{ id: "g1", url: FLAT }] as unknown as string } }), null);
});

test("every slot the resolver names is a real slot", () => {
  // The guard against drift: if lib/photoSlots.ts renames a slot and this file
  // is not updated, the profile picture would silently fall through to the
  // reference photograph. Fail here instead.
  const known = new Set(ALL_SLOTS.map((s) => s.id));
  for (const id of faceSlotIds()) assert.ok(known.has(id), `${id} is not a slot in photoSlots.ts`);
});

test("precedence is sketch, then flat, then model — in that order", () => {
  assert.deepEqual(
    FACE_FAMILIES.map((f) => f.id),
    ["sketch", "flat", "model"]
  );
});

// ---------------------------------------------------------------------------
// Photography moved onto the sample round (Tess, 2026-08-05: "photography
// should not be it's own section, it needs to live within the specific sample
// round"). The face of a style has to follow it there.
// ---------------------------------------------------------------------------

test("a round's photograph replaces the style's in the same slot", () => {
  const merged = withRoundPhotos(
    { photos: { flat_front: "https://old/flat.jpg" } },
    { flat_front: "https://pps/flat.jpg" }
  );
  assert.equal(styleCoverUrl(merged), "https://pps/flat.jpg");
});

test("a shoot filed before rounds existed is still the face when no round has one", () => {
  // The data-loss guard. Everything already on styles.photos keeps working,
  // untouched, for as long as nobody re-shoots that slot.
  const merged = withRoundPhotos(
    { photos: { flat_front: "https://old/flat.jpg", flat_back: "https://old/back.jpg" } },
    { detail: "https://pps/detail.jpg" }
  );
  assert.equal(styleCoverUrl(merged), "https://old/flat.jpg");
  assert.equal(styleFaces(merged).back?.url, "https://old/back.jpg");
});

test("the drawing still outranks the round's photograph", () => {
  // The merge decides WHICH lay flat, never whether a lay flat beats a sketch.
  const merged = withRoundPhotos(
    { photos: { sketch: "https://draw/front.png" } },
    { flat_front: "https://pps/flat.jpg", model_front: "https://pps/model.jpg" }
  );
  assert.equal(styleCoverUrl(merged), "https://draw/front.png");
  assert.equal(styleFaces(merged).family, "sketch");
});

test("withRoundPhotos keeps cover_image as the last fallback and never mutates", () => {
  const style = { cover_image: "https://inherited/ref.jpg", photos: { sketch: "" } };
  const snapshot = JSON.stringify(style);
  const merged = withRoundPhotos(style, null);
  assert.equal(styleCoverUrl(merged), "https://inherited/ref.jpg");
  assert.equal(JSON.stringify(style), snapshot);

  // And everything jsonb can hand back is survivable on both sides.
  for (const junk of [null, undefined, "nope", 7, ["a"], {}]) {
    assert.deepEqual(withRoundPhotos({ photos: junk }, junk).photos, {});
  }
});
