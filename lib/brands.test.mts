import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANDS, BRAND_SLUGS, DEFAULT_BRAND, isBrandSlug, brandOr, brandName } from "./brands.ts";

test("the brand list is slugs and names, all unique", () => {
  assert.ok(BRANDS.length >= 2);
  assert.equal(new Set(BRAND_SLUGS).size, BRAND_SLUGS.length);
  for (const b of BRANDS) {
    assert.ok(b.slug.length > 0 && b.name.length > 0);
  }
  assert.ok(BRAND_SLUGS.includes(DEFAULT_BRAND));
});

test("a slug is validated, and a bad one falls back to the default", () => {
  assert.equal(isBrandSlug("renggli"), true);
  assert.equal(isBrandSlug("nope"), false);
  assert.equal(isBrandSlug(null), false);
  // brandOr is the guard the cookie reader leans on: never scope to nothing.
  assert.equal(brandOr("renggli"), "renggli");
  assert.equal(brandOr("deleted-brand"), DEFAULT_BRAND);
  assert.equal(brandOr(undefined), DEFAULT_BRAND);
});

test("a slug reads back as its name; an unknown slug reads as itself", () => {
  assert.equal(brandName("sous-sous"), "SOUS SOUS");
  assert.equal(brandName("renggli"), "RENGGLI");
  assert.equal(brandName("legacy"), "legacy");
  assert.equal(brandName(null), "");
});
