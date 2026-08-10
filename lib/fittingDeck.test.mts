import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFittingDeck,
  buildFittingSlide,
  materialLine,
  type DeckSlideInput,
} from "./fittingDeck.ts";

const FULL: DeckSlideInput = {
  styleNo: "SS-100",
  name: "Anorak Jacket",
  garment: "Jacket",
  roundLabel: "2nd Proto",
  factory: "All Systems",
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
