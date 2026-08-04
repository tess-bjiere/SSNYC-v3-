import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sourceLabel,
  repurposeNote,
  carriedNotes,
  repurposeName,
  repurposeDraft,
} from "./clone.ts";

const SRC = {
  id: "st-1",
  name: "Cropped Rib Tank",
  style_no: "SS-1042",
  category: "Tops",
  garment: "Tank",
  designer: "In-house",
  brand: "SOUS SOUS",
  factory: "Sunrise Mills",
  cover_image: "https://cdn/tank.jpg",
  tech_pack_url: "https://drive/techpack",
  notes: "Developed from a library reference: Margiela — 1990s.",
  fit_notes: "Runs long through the body — still needs 1cm off the front rise.",
  season: "SS27",
};

test("the original is named by what the factory knows it as", () => {
  assert.equal(sourceLabel(SRC), "Cropped Rib Tank (SS-1042, SS27)");
  assert.equal(sourceLabel({ ...SRC, style_no: null }), "Cropped Rib Tank (SS27)");
  assert.equal(sourceLabel({ ...SRC, style_no: null, season: "  " }), "Cropped Rib Tank");
  assert.equal(sourceLabel({ id: "x", name: "   " }), "Untitled");
});

test("the provenance line names the season it was repurposed into", () => {
  assert.equal(
    repurposeNote(SRC, "SS28"),
    "Repurposed from Cropped Rib Tank (SS-1042, SS27) for SS28."
  );
  assert.equal(repurposeNote(SRC, null), "Repurposed from Cropped Rib Tank (SS-1042, SS27).");
});

test("the original's own notes are kept below the new line, so the chain survives", () => {
  const out = carriedNotes(SRC, "SS28");
  assert.ok(out.startsWith("Repurposed from Cropped Rib Tank (SS-1042, SS27) for SS28."));
  // A repurpose of a style that came from a library photo should still lead back
  // to the photo.
  assert.ok(out.includes("Margiela"));
  assert.equal(carriedNotes({ ...SRC, notes: null }, "SS28"), repurposeNote(SRC, "SS28"));
  assert.equal(carriedNotes({ ...SRC, notes: "   " }, "SS28"), repurposeNote(SRC, "SS28"));
});

test("the copy is named for its season so the grid has no twins", () => {
  assert.equal(repurposeName(SRC, { season: "SS28" }), "Cropped Rib Tank — SS28");
  assert.equal(repurposeName(SRC, {}), "Cropped Rib Tank — repurposed");
  assert.equal(repurposeName(SRC, { season: "  " }), "Cropped Rib Tank — repurposed");
});

test("a name typed into the form always wins", () => {
  assert.equal(repurposeName(SRC, { name: "Rib Tank II", season: "SS28" }), "Rib Tank II");
  assert.equal(repurposeName(SRC, { name: "  " , season: "SS28" }), "Cropped Rib Tank — SS28");
});

test("the season is not stuttered onto a name that already ends in it", () => {
  assert.equal(repurposeName({ ...SRC, name: "Rib Tank SS28" }, { season: "SS28" }), "Rib Tank SS28");
  assert.equal(repurposeName({ ...SRC, name: "Rib Tank ss28" }, { season: "SS28" }), "Rib Tank ss28");
});

test("the making of the garment carries forward", () => {
  const d = repurposeDraft(SRC, { season: "SS28" });
  assert.equal(d.category, "Tops");
  assert.equal(d.garment, "Tank");
  assert.equal(d.designer, "In-house");
  assert.equal(d.brand, "SOUS SOUS");
  assert.equal(d.factory, "Sunrise Mills");
  assert.equal(d.cover_image, "https://cdn/tank.jpg");
  assert.equal(d.tech_pack_url, "https://drive/techpack");
});

test("the block knowledge is the reason to repurpose, so fit notes carry", () => {
  assert.equal(repurposeDraft(SRC, { season: "SS28" }).fit_notes, SRC.fit_notes);
});

test("the season is replaced, not inherited", () => {
  assert.equal(repurposeDraft(SRC, { season: "SS28" }).season, "SS28");
  // No season typed means no season — never last season's, which would make the
  // copy look like a duplicate of the original.
  assert.equal(repurposeDraft(SRC, {}).season, null);
});

test("the copy starts in development, not wherever the original ended up", () => {
  assert.equal(repurposeDraft(SRC, { season: "SS28" }).status, "development");
});

test("the copy is not itself evergreen — the block is", () => {
  assert.equal(repurposeDraft(SRC, { season: "SS28" }).evergreen, false);
});

test("the style number is left blank so two styles never share a PO number", () => {
  assert.equal(repurposeDraft(SRC, { season: "SS28" }).style_no, null);
  assert.equal(repurposeDraft(SRC, { season: "SS28", style_no: "SS-1109" }).style_no, "SS-1109");
});

test("blank fields on the original stay blank rather than becoming empty strings", () => {
  const d = repurposeDraft({ id: "x", name: "Thing", factory: "  ", garment: "" }, {});
  assert.equal(d.factory, null);
  assert.equal(d.garment, null);
  assert.equal(d.fit_notes, null);
});

test("the draft carries nothing that belongs to last season's making", () => {
  const d = repurposeDraft(SRC, { season: "SS28" }) as Record<string, unknown>;
  // Photography, sample rounds, comments and versions are per-season and must
  // not ride along on the insert.
  for (const key of ["photos", "id", "created_at", "updated_at", "stage"]) {
    assert.equal(key in d, false, `${key} should not be in the draft`);
  }
});
