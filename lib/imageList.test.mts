import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GALLERY_KEY,
  SHOTS_KEY,
  COLORWAYS_KEY,
  readImages,
  withImageAdded,
  withImageRemoved,
  withImageCaption,
  withImageMoved,
  withImageUrl,
  imageCountLabel,
} from "./imageList.ts";

test("withImageUrl swaps the url in place, keeping id, caption, position and the other keys", () => {
  const raw = {
    // A photography slot alongside the gallery — it must survive a gallery crop.
    front: "https://slot/front.jpg",
    gallery: [
      { id: "a", url: "https://old/a.jpg", caption: "Front" },
      { id: "b", url: "https://old/b.jpg", caption: "Back" },
    ],
  };
  const next = withImageUrl(raw, GALLERY_KEY, "a", "https://new/a-cropped.jpg");
  assert.equal((next.front as string), "https://slot/front.jpg"); // slot untouched
  const list = readImages(next, GALLERY_KEY);
  assert.deepEqual(list[0], { id: "a", url: "https://new/a-cropped.jpg", caption: "Front" });
  assert.deepEqual(list[1], { id: "b", url: "https://old/b.jpg", caption: "Back" }); // order kept
  // A blank url or an unknown id changes nothing.
  assert.deepEqual(readImages(withImageUrl(raw, GALLERY_KEY, "a", "  "), GALLERY_KEY), readImages(raw, GALLERY_KEY));
  assert.deepEqual(readImages(withImageUrl(raw, GALLERY_KEY, "zzz", "x"), GALLERY_KEY), readImages(raw, GALLERY_KEY));
});

test("nothing stored reads as an empty list rather than throwing", () => {
  for (const raw of [null, undefined, {}, [], "nonsense", 7, { gallery: null }, { gallery: "x" }]) {
    assert.deepEqual(readImages(raw, GALLERY_KEY), []);
  }
});

test("the three shapes that will exist in the wild all read", () => {
  const raw = {
    gallery: [
      "https://a.example/one.jpg",
      { id: "b", url: "https://b.example/two.jpg", caption: "Back" },
      { image_url: "https://c.example/three.jpg" },
      { thumb_url: "https://d.example/four.jpg" },
    ],
  };
  const list = readImages(raw, GALLERY_KEY);
  assert.equal(list.length, 4);
  assert.equal(list[0].url, "https://a.example/one.jpg");
  // A bare string has no id of its own, so the URL becomes one — it still has
  // to be addressable for caption and remove.
  assert.equal(list[0].id, "https://a.example/one.jpg");
  assert.equal(list[1].caption, "Back");
  assert.equal(list[2].url, "https://c.example/three.jpg");
  assert.equal(list[3].url, "https://d.example/four.jpg");
});

test("entries with no usable url are dropped, not rendered as broken frames", () => {
  const raw = { gallery: [{ url: "" }, { caption: "orphan" }, null, 3, { url: "https://ok.example/a.jpg" }] };
  const list = readImages(raw, GALLERY_KEY);
  assert.equal(list.length, 1);
  assert.equal(list[0].url, "https://ok.example/a.jpg");
});

test("duplicate ids are made unique so two React keys can never collide", () => {
  const raw = { gallery: [{ id: "x", url: "https://a" }, { id: "x", url: "https://b" }] };
  const list = readImages(raw, GALLERY_KEY);
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
});

test("writing a gallery preserves the photography slots beside it", () => {
  // This is the whole reason these functions take and return the raw map: the
  // fixed slots live in the same jsonb, and a gallery write that dropped them
  // would delete a shoot.
  const raw = { model_front: "https://shot/front.jpg", sketch: "https://draw/1.png" };
  const next = withImageAdded(raw, GALLERY_KEY, { id: "g1", url: "https://a.example/1.jpg" });
  assert.equal(next.model_front, "https://shot/front.jpg");
  assert.equal(next.sketch, "https://draw/1.png");
  assert.equal(readImages(next, GALLERY_KEY).length, 1);
});

test("adding needs both an id and a url, and re-adding an id replaces in place", () => {
  let raw: unknown = {};
  raw = withImageAdded(raw, GALLERY_KEY, { id: "", url: "https://a" });
  raw = withImageAdded(raw, GALLERY_KEY, { id: "a", url: "" });
  raw = withImageAdded(raw, GALLERY_KEY, { id: "a", url: null });
  assert.deepEqual(readImages(raw, GALLERY_KEY), []);

  raw = withImageAdded(raw, GALLERY_KEY, { id: "a", url: "https://a.example/1.jpg" });
  raw = withImageAdded(raw, GALLERY_KEY, { id: "a", url: "https://a.example/2.jpg", caption: "redo" });
  const list = readImages(raw, GALLERY_KEY);
  assert.equal(list.length, 1);
  assert.equal(list[0].url, "https://a.example/2.jpg");
  assert.equal(list[0].caption, "redo");
});

test("removing the last image drops the key rather than leaving an empty array", () => {
  let raw: unknown = withImageAdded({ detail: "https://d" }, GALLERY_KEY, {
    id: "a",
    url: "https://a.example/1.jpg",
  });
  raw = withImageRemoved(raw, GALLERY_KEY, "a");
  assert.equal(Object.prototype.hasOwnProperty.call(raw as object, GALLERY_KEY), false);
  assert.equal((raw as Record<string, unknown>).detail, "https://d");
});

test("captioning one image leaves the others alone, and blank clears", () => {
  let raw: unknown = {};
  raw = withImageAdded(raw, GALLERY_KEY, { id: "a", url: "https://a", caption: "one" });
  raw = withImageAdded(raw, GALLERY_KEY, { id: "b", url: "https://b", caption: "two" });
  raw = withImageCaption(raw, GALLERY_KEY, "a", "  changed  ");
  let list = readImages(raw, GALLERY_KEY);
  assert.equal(list[0].caption, "changed");
  assert.equal(list[1].caption, "two");

  raw = withImageCaption(raw, GALLERY_KEY, "a", "   ");
  list = readImages(raw, GALLERY_KEY);
  assert.equal(list[0].caption, "");

  // An id that is not there changes nothing.
  const before = JSON.stringify(raw);
  raw = withImageCaption(raw, GALLERY_KEY, "nope", "x");
  assert.equal(JSON.stringify(raw), before);
});

test("moving stops at the ends instead of wrapping around", () => {
  let raw: unknown = {};
  for (const id of ["a", "b", "c"]) {
    raw = withImageAdded(raw, SHOTS_KEY, { id, url: `https://${id}` });
  }
  const ids = (r: unknown) => readImages(r, SHOTS_KEY).map((im) => im.id);

  assert.deepEqual(ids(withImageMoved(raw, SHOTS_KEY, "a", -1)), ["a", "b", "c"]);
  assert.deepEqual(ids(withImageMoved(raw, SHOTS_KEY, "c", 1)), ["a", "b", "c"]);
  assert.deepEqual(ids(withImageMoved(raw, SHOTS_KEY, "a", 1)), ["b", "a", "c"]);
  assert.deepEqual(ids(withImageMoved(raw, SHOTS_KEY, "c", -1)), ["a", "c", "b"]);
  // Any negative is "earlier", any positive is "later" — one step either way.
  assert.deepEqual(ids(withImageMoved(raw, SHOTS_KEY, "a", 99)), ["b", "a", "c"]);
  assert.deepEqual(ids(withImageMoved(raw, SHOTS_KEY, "missing", 1)), ["a", "b", "c"]);
});

test("the two lists live side by side in one map without touching each other", () => {
  let raw: unknown = {};
  raw = withImageAdded(raw, GALLERY_KEY, { id: "g", url: "https://g" });
  raw = withImageAdded(raw, SHOTS_KEY, { id: "s", url: "https://s" });
  raw = withImageRemoved(raw, GALLERY_KEY, "g");
  assert.deepEqual(readImages(raw, GALLERY_KEY), []);
  assert.equal(readImages(raw, SHOTS_KEY).length, 1);
});

test("the count label says the noun and the plural", () => {
  let raw: unknown = {};
  assert.equal(imageCountLabel(raw, GALLERY_KEY), "");
  raw = withImageAdded(raw, GALLERY_KEY, { id: "a", url: "https://a" });
  assert.equal(imageCountLabel(raw, GALLERY_KEY), "1 image");
  raw = withImageAdded(raw, GALLERY_KEY, { id: "b", url: "https://b" });
  assert.equal(imageCountLabel(raw, GALLERY_KEY), "2 images");
  assert.equal(imageCountLabel(raw, GALLERY_KEY, "shot"), "2 shots");
});

// --- colourways -------------------------------------------------------------
//
// Tess, 2026-08-07: "add a way to add multiple colors to a style profile".
// A third list in the same map, which is only safe because every writer here
// carries through the keys it did not come for — the photography slots live in
// that map, and a colourway write that dropped them would delete a shoot.

test("colourways are a third list beside the gallery, not instead of it", () => {
  const photos = {
    flat_front: "https://x/front.jpg",
    [GALLERY_KEY]: [{ id: "g1", url: "https://x/g1.jpg", caption: "" }],
  };
  const next = withImageAdded(photos, COLORWAYS_KEY, {
    id: "c1",
    url: "https://x/bone.jpg",
    caption: "Bone",
  });
  assert.equal(readImages(next, COLORWAYS_KEY).length, 1);
  assert.equal(readImages(next, GALLERY_KEY).length, 1);
  // The fixed photography slot is still there. This is the whole guard.
  assert.equal((next as Record<string, unknown>).flat_front, "https://x/front.jpg");
});

test("the colour name is the caption, and it is editable in place", () => {
  const one = withImageAdded({}, COLORWAYS_KEY, { id: "c1", url: "https://x/a.jpg", caption: "Bone" });
  assert.equal(readImages(one, COLORWAYS_KEY)[0].caption, "Bone");
  const renamed = withImageCaption(one, COLORWAYS_KEY, "c1", "Antique White");
  assert.equal(readImages(renamed, COLORWAYS_KEY)[0].caption, "Antique White");
});

test("a colourway with no name yet is still kept", () => {
  // A picture of a colour nobody has named is worth having on the page.
  const one = withImageAdded({}, COLORWAYS_KEY, { id: "c1", url: "https://x/a.jpg", caption: "" });
  assert.equal(readImages(one, COLORWAYS_KEY).length, 1);
});

test("removing a colourway leaves the gallery alone", () => {
  let photos: Record<string, unknown> = withImageAdded({}, GALLERY_KEY, {
    id: "g1",
    url: "https://x/g1.jpg",
    caption: "",
  });
  photos = withImageAdded(photos, COLORWAYS_KEY, { id: "c1", url: "https://x/c1.jpg", caption: "Black" });
  photos = withImageRemoved(photos, COLORWAYS_KEY, "c1");
  assert.equal(readImages(photos, COLORWAYS_KEY).length, 0);
  assert.equal(readImages(photos, GALLERY_KEY).length, 1);
});
