// Storage-path tests. Run with:  npm run test:storage
//
// These guard the one irreversible operation in the app: permanently deleting a
// reference's files. The rule being tested throughout is "when in doubt, delete
// nothing" — an unrecognised URL, a foreign bucket, or a file another reference
// still points at must never end up in the delete list.

import assert from "node:assert/strict";
import test from "node:test";
import {
  storagePathFromUrl,
  referenceImageUrls,
  referenceStoragePaths,
  safeToDelete,
  REFERENCES_BUCKET,
} from "./storage.ts";

const BASE = "https://axwavdjhzvtluvsixfjq.supabase.co/storage/v1/object/public/references";

test("reads the object path out of a public storage URL", () => {
  assert.equal(storagePathFromUrl(`${BASE}/abc-123/full.jpg`), "abc-123/full.jpg");
  assert.equal(storagePathFromUrl(`${BASE}/abc-123/thumb.jpg`), "abc-123/thumb.jpg");
});

test("handles signed, authenticated and query-string forms", () => {
  assert.equal(storagePathFromUrl(`${BASE}/abc/full.jpg?token=xyz`), "abc/full.jpg");
  assert.equal(
    storagePathFromUrl(
      "https://p.supabase.co/storage/v1/object/authenticated/references/abc/full.jpg"
    ),
    "abc/full.jpg"
  );
  assert.equal(storagePathFromUrl(`${BASE}/a%20b/full.jpg`), "a b/full.jpg");
});

test("returns null for anything that is not an object in this bucket", () => {
  assert.equal(storagePathFromUrl(null), null);
  assert.equal(storagePathFromUrl(""), null);
  assert.equal(storagePathFromUrl(42), null);
  assert.equal(storagePathFromUrl("https://example.com/photo.jpg"), null);
  assert.equal(storagePathFromUrl("data:image/png;base64,AAAA"), null);
  assert.equal(
    storagePathFromUrl("https://p.supabase.co/storage/v1/object/public/avatars/abc/full.jpg"),
    null
  );
  // Same project, but the bucket name only *starts* the same — not ours.
  assert.equal(
    storagePathFromUrl("https://p.supabase.co/storage/v1/object/public/references-old/a/full.jpg"),
    null
  );
});

test("refuses paths that try to climb out of the bucket", () => {
  assert.equal(storagePathFromUrl(`${BASE}/../../etc/passwd`), null);
  assert.equal(storagePathFromUrl(`${BASE}/%2e%2e/other/full.jpg`), null);
  assert.equal(storagePathFromUrl(`${BASE}//leading-slash.jpg`), null);
});

test("collects every URL a reference points at, deduped and in order", () => {
  const urls = referenceImageUrls({
    image_url: `${BASE}/main/full.jpg`,
    thumb_url: `${BASE}/main/thumb.jpg`,
    image: `${BASE}/main/full.jpg`, // legacy column repeating the same file
    thumb: null,
    extra_images: [
      { image_url: `${BASE}/x1/full.jpg`, thumb_url: `${BASE}/x1/thumb.jpg` },
      `${BASE}/x2/full.jpg`,
    ],
  });
  assert.deepEqual(urls, [
    `${BASE}/main/full.jpg`,
    `${BASE}/main/thumb.jpg`,
    `${BASE}/x1/full.jpg`,
    `${BASE}/x1/thumb.jpg`,
    `${BASE}/x2/full.jpg`,
  ]);
});

test("survives a malformed extra_images value without throwing", () => {
  assert.deepEqual(referenceImageUrls({ extra_images: null }), []);
  assert.deepEqual(referenceImageUrls({ extra_images: "not-an-array" }), []);
  assert.deepEqual(referenceImageUrls({ extra_images: [null, 7, {}, { image_url: null }] }), []);
});

test("storage paths skip external images but keep our own", () => {
  const paths = referenceStoragePaths({
    image_url: "https://images.example.com/scraped.jpg",
    thumb_url: `${BASE}/main/thumb.jpg`,
    extra_images: [`${BASE}/x1/full.jpg`, "https://cdn.example.com/other.png"],
  });
  assert.deepEqual(paths, ["main/thumb.jpg", "x1/full.jpg"]);
});

test("a reference with no storage-backed images yields nothing to delete", () => {
  assert.deepEqual(
    referenceStoragePaths({ image_url: "https://example.com/a.jpg", extra_images: [] }),
    []
  );
});

test("files another reference still uses are never deleted", () => {
  const candidates = ["shared/full.jpg", "shared/thumb.jpg", "mine/full.jpg"];
  const stillUsed = ["shared/full.jpg", "shared/thumb.jpg", "someone-else/full.jpg"];
  assert.deepEqual(safeToDelete(candidates, stillUsed), ["mine/full.jpg"]);
});

test("with nothing else in the library every candidate is deletable", () => {
  const candidates = ["a/full.jpg", "a/thumb.jpg"];
  assert.deepEqual(safeToDelete(candidates, []), candidates);
});

test("the bucket name is the one the uploader writes to", () => {
  assert.equal(REFERENCES_BUCKET, "references");
});
