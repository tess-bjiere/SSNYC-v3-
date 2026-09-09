import assert from "node:assert/strict";
import { test } from "node:test";
import { mergedExtraImages, extraImageUrl } from "./referenceMerge.ts";

test("merging folds every other profile's images onto the keeper", () => {
  const keeper = { image_url: "K.jpg", extra_images: ["K2.jpg"] };
  const others = [
    { image_url: "A.jpg", extra_images: ["A2.jpg"] },
    { image_url: "B.jpg", extra_images: [] },
  ];
  assert.deepEqual(mergedExtraImages(keeper, others), ["K2.jpg", "A.jpg", "A2.jpg", "B.jpg"]);
});

test("the keeper's own main image is never duplicated into its extras", () => {
  const keeper = { image_url: "K.jpg", extra_images: [] };
  // Another profile happens to hold the same image — it must not reappear.
  const others = [{ image_url: "K.jpg", extra_images: ["new.jpg"] }];
  assert.deepEqual(mergedExtraImages(keeper, others), ["new.jpg"]);
});

test("duplicate URLs across profiles collapse to one", () => {
  const keeper = { image_url: "K.jpg", extra_images: ["shared.jpg"] };
  const others = [{ image_url: "A.jpg", extra_images: ["shared.jpg"] }];
  assert.deepEqual(mergedExtraImages(keeper, others), ["shared.jpg", "A.jpg"]);
});

test("object-shaped extras are read by their image_url", () => {
  const keeper = { image_url: "K.jpg", extra_images: [] };
  const others = [{ image_url: null, extra_images: [{ image_url: "obj.jpg", thumb_url: "t.jpg" }] }];
  assert.deepEqual(mergedExtraImages(keeper, others), [{ image_url: "obj.jpg", thumb_url: "t.jpg" }]);
  assert.equal(extraImageUrl({ image_url: "obj.jpg" }), "obj.jpg");
  assert.equal(extraImageUrl("plain.jpg"), "plain.jpg");
});
