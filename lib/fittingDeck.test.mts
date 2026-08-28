import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFittingDeck,
  buildFittingSlide,
  materialLine,
  noteLines,
  type DeckSlideInput,
} from "./fittingDeck.ts";

const FULL: DeckSlideInput = {
  styleNo: "SS-100",
  name: "Anorak Jacket",
  garment: "Jacket",
  season: "SS27",
  brand: "SOUS SOUS",
  roundLabel: "2nd Proto",
  factory: "All Systems",
  fittingDate: "Aug 12, 2026",
  images: [
    { url: "https://x/front.jpg", label: "Model — front", note: "1. Shoulder dropped", pins: [{ x: 0.5, y: 0.3, text: "Shoulder dropped" }] },
    { url: "https://x/back.jpg", label: "Model — back", note: null, pins: [] },
  ],
  fitNotes: "Body length correct. Shoulder needs work.",
  factoryComments: "Mesh is placeholder.",
  materialType: "Nylon",
  materialContents: "100% Poly",
  materialSupplier: "XX Premiere",
};

test("the material line joins fabric, contents and supplier, and is null when empty", () => {
  assert.equal(materialLine(FULL), "Nylon · 100% Poly · XX Premiere");
  assert.equal(materialLine({ materialType: "Nylon" }), "Nylon");
  assert.equal(materialLine({}), null);
});

test("a slide's subtitle identifies the fitting in the studio's own terms", () => {
  const slide = buildFittingSlide(FULL);
  assert.equal(slide.subtitle, "SS-100 · 2nd Proto · Jacket · All Systems");
  assert.equal(slide.name, "Anorak Jacket");
  // The fitting date rides onto the slide; a round with none carries null.
  assert.equal(slide.fitDate, "Aug 12, 2026");
  assert.equal(buildFittingSlide({ name: "x", images: [] }).fitDate, null);
  assert.equal(slide.material, "Nylon · 100% Poly · XX Premiere");
  assert.equal(slide.images.length, 2);
  // The mark-up pins ride through untouched, so they land on the picture.
  assert.deepEqual(slide.images[0].pins, [{ x: 0.5, y: 0.3, text: "Shoulder dropped" }]);
  assert.equal(slide.empty, false);
});

test("a selected style with nothing recorded is kept but flagged empty", () => {
  const slide = buildFittingSlide({ name: "Bare", images: [] });
  assert.equal(slide.empty, true);
  assert.equal(slide.name, "Bare");
  // An unnamed style still reads as something rather than a blank heading.
  assert.equal(buildFittingSlide({ name: "", images: [] }).name, "Untitled style");
});

test("the deck counts its styles and names the day it was made", () => {
  const deck = buildFittingDeck([FULL, { name: "Tee", images: [] }], { generatedOn: "2026-08-10" });
  assert.equal(deck.title, "Fitting review");
  assert.equal(deck.subtitle, "2 styles · 2026-08-10");
  assert.equal(deck.slides.length, 2);
  // Singular for one.
  assert.equal(buildFittingDeck([FULL], { generatedOn: "2026-08-10" }).subtitle, "1 style · 2026-08-10");
});

test("the cover carries the season, the brand and the list of products", () => {
  const deck = buildFittingDeck(
    [
      FULL,
      { styleNo: "SS-101", name: "Cargo Trouser", season: "SS27", brand: "SOUS SOUS", images: [] },
      { styleNo: "AW-002", name: "Silk Shell", season: "AW27", brand: "SOUS SOUS", images: [] },
    ],
    { generatedOn: "2026-08-10" }
  );
  // A deck spanning two seasons names both; one brand across all three shows once.
  assert.equal(deck.season, "SS27 · AW27");
  assert.equal(deck.brand, "SOUS SOUS");
  // Every product is on the contents list, in pick order.
  assert.deepEqual(deck.contents, [
    { name: "Anorak Jacket", styleNo: "SS-100" },
    { name: "Cargo Trouser", styleNo: "SS-101" },
    { name: "Silk Shell", styleNo: "AW-002" },
  ]);
  // Nothing to say reads as null rather than an empty line.
  const bare = buildFittingDeck([{ name: "x", images: [] }], { generatedOn: "2026-08-10" });
  assert.equal(bare.season, null);
  assert.equal(bare.brand, null);
});

test("the sketch url is carried onto the slide, trimmed, null when blank", () => {
  assert.equal(buildFittingSlide({ name: "x", images: [], sketch: " https://s/sketch.png " }).sketch,
    "https://s/sketch.png");
  assert.equal(buildFittingSlide({ name: "x", images: [] }).sketch, null);
  assert.equal(buildFittingSlide({ name: "x", images: [], sketch: "   " }).sketch, null);
});

test("the back sketch is carried onto the slide, independent of the front", () => {
  const s = buildFittingSlide({ name: "x", images: [], sketch: "f.png", sketchBack: " b.png " });
  assert.equal(s.sketch, "f.png");
  assert.equal(s.sketchBack, "b.png");
  // A style with only a back drawing still carries it; a front-only style has null back.
  assert.equal(buildFittingSlide({ name: "x", images: [], sketchBack: "b.png" }).sketchBack, "b.png");
  assert.equal(buildFittingSlide({ name: "x", images: [], sketch: "f.png" }).sketchBack, null);
});

test("noteLines splits a flattened note into bullet and text lines with depth", () => {
  // The shape docToText produces: "• " at the top, "  - " nested two spaces deep.
  const lines = noteLines("Body corrected.\n• Neckline gaps 0.5cm\n• Armhole drag\n  - fix before bulk");
  assert.deepEqual(lines, [
    { kind: "text", depth: 0, marker: "", text: "Body corrected." },
    { kind: "bullet", depth: 0, marker: "•", text: "Neckline gaps 0.5cm" },
    { kind: "bullet", depth: 0, marker: "•", text: "Armhole drag" },
    { kind: "bullet", depth: 1, marker: "-", text: "fix before bulk" },
  ]);
});

test("noteLines is empty for a blank note and skips blank separator lines", () => {
  assert.deepEqual(noteLines(""), []);
  assert.deepEqual(noteLines(null), []);
  assert.deepEqual(noteLines("• one\n\n• two"), [
    { kind: "bullet", depth: 0, marker: "•", text: "one" },
    { kind: "bullet", depth: 0, marker: "•", text: "two" },
  ]);
});
