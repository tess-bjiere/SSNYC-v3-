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

test("intended fit is carried onto the slide, trimmed; it alone is not empty", () => {
  assert.equal(
    buildFittingSlide({ name: "x", images: [], intendedFit: "  Relaxed, hits at the hip.  " }).intendedFit,
    "Relaxed, hits at the hip."
  );
  assert.equal(buildFittingSlide({ name: "x", images: [] }).intendedFit, null);
  // A style with only an intended fit still has a page — it is not "empty".
  assert.equal(buildFittingSlide({ name: "x", images: [], intendedFit: "Slim." }).empty, false);
});

test("history carries prior rounds in the given order, trimmed", () => {
  const slide = buildFittingSlide({
    name: "x", images: [],
    history: [
      { roundLabel: "2nd Proto", fittingDate: "12 Aug 26", rating: "workable",
        fitNotes: " Shoulder still wide ", factoryComments: " " },
      { roundLabel: "1st Proto", fittingDate: "1 Jul 26", rating: "poor",
        fitNotes: "Body 2cm long", factoryComments: "Wrong rib" },
    ],
  });
  assert.deepEqual(slide.history, [
    { roundLabel: "2nd Proto", fitDate: "12 Aug 26", rating: "workable",
      fitNotes: "Shoulder still wide", factoryComments: null },
    { roundLabel: "1st Proto", fitDate: "1 Jul 26", rating: "poor",
      fitNotes: "Body 2cm long", factoryComments: "Wrong rib" },
  ]);
});

test("history drops rounds with nothing to show but keeps a rating-only round", () => {
  const slide = buildFittingSlide({
    name: "x", images: [],
    history: [
      { roundLabel: "PPS", fittingDate: "1 Sep 26", rating: "good" }, // rating only — kept
      { roundLabel: "SMS", fittingDate: "20 Aug 26" },                // nothing — dropped
      { roundLabel: "2nd Proto", rating: null, fitNotes: "Neckline gaps" },
    ],
  });
  assert.deepEqual(slide.history.map((h) => h.roundLabel), ["PPS", "2nd Proto"]);
});

test("history is empty when no prior rounds are passed (latest-only mode)", () => {
  assert.deepEqual(buildFittingSlide({ name: "x", images: [] }).history, []);
});

test("material falls back to the style's free-text spec when the round has none", () => {
  // Round-level structured material wins when present.
  assert.equal(
    buildFittingSlide({
      name: "x", images: [],
      materialType: "Nylon", materialContents: "100% Poly", materialSupplier: "XX",
      materialText: "styles.material spec",
    }).material,
    "Nylon · 100% Poly · XX"
  );
  // With no round material, the style's free-text material is shown.
  assert.equal(
    buildFittingSlide({ name: "x", images: [], materialText: "82% Nylon 18% Elastane" }).material,
    "82% Nylon 18% Elastane"
  );
  // Neither present → null, and that keeps counting toward "empty".
  const bare = buildFittingSlide({ name: "x", images: [] });
  assert.equal(bare.material, null);
  assert.equal(bare.empty, true);
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

test("noteLines is empty for a blank note", () => {
  assert.deepEqual(noteLines(""), []);
  assert.deepEqual(noteLines(null), []);
});

test("noteLines keeps a blank line between notes as a break", () => {
  // A single blank line the writer left is preserved as one break.
  assert.deepEqual(noteLines("• one\n\n• two"), [
    { kind: "bullet", depth: 0, marker: "•", text: "one" },
    { kind: "break", depth: 0, marker: "", text: "" },
    { kind: "bullet", depth: 0, marker: "•", text: "two" },
  ]);
  // Leading, trailing and doubled blanks do not open or grow the column.
  assert.deepEqual(noteLines("\n\nfirst\n\n\nsecond\n\n"), [
    { kind: "text", depth: 0, marker: "", text: "first" },
    { kind: "break", depth: 0, marker: "", text: "" },
    { kind: "text", depth: 0, marker: "", text: "second" },
  ]);
});

test("a paragraph after a bulleted list gets space above it", () => {
  // docToText joins a list and a following paragraph with a single newline, so
  // the block spacing the writer saw is gone; noteLines restores it as a break
  // above the paragraph — but NOT above a list that follows its intro line, nor
  // between consecutive bullets.
  const lines = noteLines("• a\n• b\nEdits from Conley:\n• c\n• d\nPostmortem note");
  assert.deepEqual(lines, [
    { kind: "bullet", depth: 0, marker: "•", text: "a" },
    { kind: "bullet", depth: 0, marker: "•", text: "b" },
    { kind: "break", depth: 0, marker: "", text: "" },
    { kind: "text", depth: 0, marker: "", text: "Edits from Conley:" },
    { kind: "bullet", depth: 0, marker: "•", text: "c" },
    { kind: "bullet", depth: 0, marker: "•", text: "d" },
    { kind: "break", depth: 0, marker: "", text: "" },
    { kind: "text", depth: 0, marker: "", text: "Postmortem note" },
  ]);
});
