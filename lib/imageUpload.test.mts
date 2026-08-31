import assert from "node:assert/strict";
import { test } from "node:test";
import { isHeicUpload, isAcceptableImage } from "./imageUpload.ts";

test("HEIC/HEIF is caught by MIME type", () => {
  assert.equal(isHeicUpload("IMG_0421", "image/heic"), true);
  assert.equal(isHeicUpload("IMG_0421", "image/heif"), true);
});

test("HEIC/HEIF is caught by file name when the MIME is empty", () => {
  // The case that produced the broken images: an iPhone photo with no MIME.
  assert.equal(isHeicUpload("IMG_0421.HEIC", ""), true);
  assert.equal(isHeicUpload("IMG_0421.heic", null), true);
  assert.equal(isHeicUpload("scan.heif", undefined), true);
});

test("ordinary web images are not HEIC", () => {
  assert.equal(isHeicUpload("photo.jpg", "image/jpeg"), false);
  assert.equal(isHeicUpload("art.png", "image/png"), false);
  assert.equal(isHeicUpload("shot.webp", "image/webp"), false);
});

test("a HEIC in the middle of a name is not mistaken for a HEIC file", () => {
  // "heic" must be the actual extension, not just present in the stem.
  assert.equal(isHeicUpload("theican.jpg", "image/jpeg"), false);
});

test("acceptable images include HEIC even with no MIME, but not non-images", () => {
  assert.equal(isAcceptableImage("photo.jpg", "image/jpeg"), true);
  assert.equal(isAcceptableImage("IMG_0421.HEIC", ""), true); // empty-MIME iPhone photo
  assert.equal(isAcceptableImage("notes.pdf", "application/pdf"), false);
  assert.equal(isAcceptableImage("mystery", ""), false);
});
