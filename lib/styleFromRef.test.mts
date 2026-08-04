// What a style inherits when it is developed from a reference.
//
// The rule these cases pin down is that developing FROM a reference never
// changes the reference and never puts the reference's designer where this
// studio's own designer belongs. Getting that wrong would quietly attribute
// every style in the tool to the house that inspired it.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftName,
  sourceNote,
  styleDraftFromReference,
  type ReferenceSeed,
} from "./styleFromRef.ts";

function seed(over: Partial<ReferenceSeed> = {}): ReferenceSeed {
  return {
    designer: "Margiela",
    year: "2000s",
    season: "Fall/Winter",
    category: "Outerwear",
    garment: "Coat",
    color: "Black",
    image_url: "https://example.test/full.jpg",
    image: null,
    thumb_url: "https://example.test/thumb.jpg",
    thumb: null,
    ...over,
  };
}

test("name prefers the garment", () => {
  assert.equal(draftName(seed()), "Coat");
});

test("name falls back to the category, then to a placeholder", () => {
  assert.equal(draftName(seed({ garment: null })), "Outerwear");
  assert.equal(draftName(seed({ garment: null, category: null })), "New style");
});

test("the name is never the reference's designer", () => {
  // Even with nothing else to go on. A style called "Margiela" would read as a
  // Margiela style forever after.
  const d = draftName(seed({ garment: "  ", category: "" }));
  assert.equal(d, "New style");
  assert.ok(!d.includes("Margiela"));
});

test("blank-ish fields are treated as absent, not as empty strings", () => {
  const d = styleDraftFromReference(seed({ category: "   ", season: "" }));
  assert.equal(d.category, null);
  assert.equal(d.season, null);
});

test("the source credit names the designer, year and season", () => {
  assert.equal(
    sourceNote(seed()),
    "Developed from a library reference: Margiela — 2000s, Fall/Winter."
  );
});

test("the source credit degrades gracefully", () => {
  assert.equal(
    sourceNote(seed({ year: null, season: null })),
    "Developed from a library reference: Margiela."
  );
  assert.equal(
    sourceNote(seed({ designer: "" })),
    "Developed from a library reference: 2000s, Fall/Winter."
  );
  assert.equal(sourceNote(seed({ designer: "", year: null, season: null })), null);
});

test("the draft carries the garment fields and the cover image", () => {
  const d = styleDraftFromReference(seed());
  assert.equal(d.name, "Coat");
  assert.equal(d.category, "Outerwear");
  assert.equal(d.garment, "Coat");
  assert.equal(d.season, "Fall/Winter");
  assert.equal(d.cover_image, "https://example.test/full.jpg");
  assert.equal(d.status, "development");
});

test("the cover falls back through the same chain the library uses", () => {
  // image_url → image → thumb_url → thumb, exactly as refImage() in lib/types.ts
  // resolves it. If that order ever changes, change it here too.
  const chain = seed({ image_url: null });
  assert.equal(styleDraftFromReference({ ...chain, image: "b" }).cover_image, "b");
  assert.equal(
    styleDraftFromReference(seed({ image_url: null, image: null })).cover_image,
    "https://example.test/thumb.jpg"
  );
  assert.equal(
    styleDraftFromReference(seed({ image_url: null, image: null, thumb_url: null, thumb: null }))
      .cover_image,
    null
  );
});

test("the draft never carries a designer, brand, factory or style number", () => {
  const d = styleDraftFromReference(seed()) as Record<string, unknown>;
  for (const k of ["designer", "brand", "factory", "style_no"]) {
    assert.equal(k in d, false, `${k} must be left for a human to fill in`);
  }
  // The designer is preserved as provenance instead, so nothing is lost.
  assert.match(String(d.notes), /Margiela/);
});

test("the draft is derived, never mutating the reference it came from", () => {
  const r = seed();
  const before = JSON.stringify(r);
  styleDraftFromReference(r);
  assert.equal(JSON.stringify(r), before);
});
