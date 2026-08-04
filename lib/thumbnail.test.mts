// Thumbnail sizing tests. Run with:  npm run test:thumbnail

import assert from "node:assert/strict";
import test from "node:test";
import { thumbDims, THUMB_MAX } from "./thumbnail.ts";

test("a large landscape image is capped on its long edge", () => {
  assert.deepEqual(thumbDims(3000, 2000, 600), { w: 600, h: 400 });
});

test("a large portrait image is capped on its long edge", () => {
  assert.deepEqual(thumbDims(2000, 3000, 600), { w: 400, h: 600 });
});

test("aspect ratio is preserved within a pixel", () => {
  const { w, h } = thumbDims(1919, 1081, 600);
  assert.ok(Math.abs(w / h - 1919 / 1081) < 0.005, `${w}×${h} drifted from the source ratio`);
});

test("images already inside the box are left alone — never upscaled", () => {
  assert.deepEqual(thumbDims(400, 300, 600), { w: 400, h: 300 });
  assert.deepEqual(thumbDims(600, 600, 600), { w: 600, h: 600 });
  assert.deepEqual(thumbDims(1, 1, 600), { w: 1, h: 1 });
});

test("an extreme panorama still gets at least one pixel on the short edge", () => {
  const { w, h } = thumbDims(10000, 3, 600);
  assert.equal(w, 600);
  assert.equal(h, 1);
});

test("unreadable dimensions yield nothing, so the caller skips the thumbnail", () => {
  assert.deepEqual(thumbDims(0, 500), { w: 0, h: 0 });
  assert.deepEqual(thumbDims(-10, 500), { w: 0, h: 0 });
  assert.deepEqual(thumbDims(NaN, 500), { w: 0, h: 0 });
});

test("the default box matches what the grids actually display", () => {
  assert.equal(THUMB_MAX, 600);
  assert.deepEqual(thumbDims(1200, 1600), { w: 450, h: 600 });
});
