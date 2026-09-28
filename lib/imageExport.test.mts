import test from "node:test";
import assert from "node:assert/strict";
import { slugify, extFromUrl, refImageName } from "./imageExport.ts";

test("slugify makes a filesystem-safe token", () => {
  assert.equal(slugify("Free City"), "free-city");
  assert.equal(slugify("Rag & Bone"), "rag-bone");
  assert.equal(slugify("  Éclair/2020  "), "eclair-2020"); // accents stripped, slashes gone
  assert.equal(slugify("The Row’s"), "the-rows");
  assert.equal(slugify(null), "");
});

test("extFromUrl trusts only real image extensions", () => {
  assert.equal(extFromUrl("https://x/refs/uuid/full.png"), "png");
  assert.equal(extFromUrl("https://x/refs/uuid/full.jpeg"), "jpg"); // normalized
  assert.equal(extFromUrl("https://x/full.webp?token=abc"), "webp"); // query stripped
  assert.equal(extFromUrl("https://x/no-extension"), "jpg"); // fallback
  assert.equal(extFromUrl(""), "jpg");
});

test("refImageName builds from tags and de-duplicates", () => {
  const taken = new Set<string>();
  assert.equal(
    refImageName({ designer: "Free City", year: "2020s", garment: "Tank" }, "jpg", taken),
    "free-city_2020s_tank.jpg"
  );
  // A second identical one must not collide.
  assert.equal(
    refImageName({ designer: "Free City", year: "2020s", garment: "Tank" }, "jpg", taken),
    "free-city_2020s_tank-2.jpg"
  );
  // No usable tags -> a stable default, still de-duplicated.
  assert.equal(refImageName({}, "png", taken), "reference.png");
  assert.equal(refImageName({ designer: "  " }, "png", taken), "reference-2.png");
});
