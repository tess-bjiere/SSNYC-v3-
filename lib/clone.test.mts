import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sourceLabel,
  repurposeNote,
  carriedNotes,
  repurposeName,
  repurposeDraft,
  duplicateNote,
  duplicateName,
  duplicateDraft,
  pickPhotoSlots,
  spawnedDuplicateLine,
  spawnedRepurposeLine,
} from "./clone.ts";

const SRC = {
  id: "st-1",
  name: "Cropped Rib Tank",
  style_no: "SS-1042",
  category: "Tops",
  garment: "Tank",
  fabric: "Butter rib",
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
  assert.equal(d.fabric, "Butter rib");
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

// --- Duplicating a style -----------------------------------------------
//
// A duplicate is not a repurpose. Same season, same garment, usually a second
// factory. The tests worth having are the four places it deliberately differs.

const DUP = { ...SRC, colors: "black / bone", status: "production" };

test("a duplicate stays in its own season", () => {
  assert.equal(duplicateDraft(DUP).season, "SS27");
  // A typed season still wins, so the same modal can move it if asked.
  assert.equal(duplicateDraft(DUP, { season: "SS28" }).season, "SS28");
});

test("a duplicate keeps the style number, because that is what makes them siblings", () => {
  assert.equal(duplicateDraft(DUP).style_no, "SS-1042");
  assert.equal(duplicateDraft(DUP, { style_no: "SS-1042B" }).style_no, "SS-1042B");
  // The contrast that matters: a repurpose blanks it, a duplicate does not.
  assert.equal(repurposeDraft(SRC, { season: "SS28" }).style_no, null);
});

test("a duplicate keeps colour and status where a repurpose does not", () => {
  assert.equal(duplicateDraft(DUP).colors, "black / bone");
  assert.equal(duplicateDraft(DUP, { colors: "olive" }).colors, "olive");
  // Something in production at one factory is in production at the other.
  assert.equal(duplicateDraft(DUP).status, "production");
  // With nothing on the original, development is the honest default.
  assert.equal(duplicateDraft({ id: "x", name: "Thing" }).status, "development");
});

test("the new factory is the choice, and it lands on the row and in the name", () => {
  const d = duplicateDraft(DUP, { factory: "Kavi" });
  assert.equal(d.factory, "Kavi");
  assert.equal(d.name, "Cropped Rib Tank \u2014 Kavi");
  // No new factory named: it stays where it was and says it is a copy.
  assert.equal(duplicateDraft(DUP).factory, "Sunrise Mills");
  assert.equal(duplicateDraft(DUP).name, "Cropped Rib Tank \u2014 copy");
  // The same factory typed back in is not a new factory.
  assert.equal(duplicateDraft(DUP, { factory: "sunrise mills" }).name, "Cropped Rib Tank \u2014 copy");
  // A typed name always wins.
  assert.equal(duplicateDraft(DUP, { factory: "Kavi", name: "Rib Tank II" }).name, "Rib Tank II");
  // And a name that already ends in the factory is not doubled up.
  assert.equal(
    duplicateName({ id: "x", name: "Rib Tank \u2014 Kavi", factory: "Bella" }, { factory: "Kavi" }),
    "Rib Tank \u2014 Kavi"
  );
});

test("the note says where it came from, and names the factory when there is a new one", () => {
  assert.equal(duplicateNote(DUP, "Kavi"), "Duplicate of Cropped Rib Tank (SS-1042, SS27) for Kavi.");
  assert.equal(duplicateNote(DUP), "Duplicate of Cropped Rib Tank (SS-1042, SS27).");
  assert.equal(duplicateNote(DUP, "sunrise mills"), "Duplicate of Cropped Rib Tank (SS-1042, SS27).");
});

test("the original's notes are kept underneath the provenance line, never replaced", () => {
  const d = duplicateDraft(DUP, { factory: "Kavi" });
  assert.equal(
    d.notes,
    "Duplicate of Cropped Rib Tank (SS-1042, SS27) for Kavi.\n\nDeveloped from a library reference: Margiela \u2014 1990s."
  );
  // Nothing to keep: just the line, and no stray blank lines.
  assert.equal(duplicateDraft({ id: "x", name: "Thing" }).notes, "Duplicate of Thing.");
});

test("a duplicate is not itself an evergreen block", () => {
  assert.equal(duplicateDraft(DUP).evergreen, false);
});

test("a duplicate carries only the photographs it was handed", () => {
  assert.equal(duplicateDraft(DUP).photos, null);
  assert.deepEqual(duplicateDraft(DUP, { photos: { sketch: "u" } }).photos, { sketch: "u" });
  // An empty object is nothing, not an empty photos map to write.
  assert.equal(duplicateDraft(DUP, { photos: {} }).photos, null);
});

test("picking slots takes the drawing and leaves everything else behind", () => {
  const photos = {
    sketch: "https://cdn/sketch.png",
    sketch_back: "  https://cdn/back.png  ",
    model_front: "https://cdn/model.jpg",
    gallery: ["https://cdn/a.jpg"],
    notes: { "https://cdn/model.jpg": { caption: "hem" } },
  };
  assert.deepEqual(pickPhotoSlots(photos, ["sketch", "sketch_back"]), {
    sketch: "https://cdn/sketch.png",
    sketch_back: "https://cdn/back.png",
  });
  // A list or a notes map can never be dragged across by asking for its key.
  assert.deepEqual(pickPhotoSlots(photos, ["gallery", "notes"]), {});
  // Missing slots are not invented, and nothing here throws on rubbish.
  assert.deepEqual(pickPhotoSlots(photos, ["flat_front"]), {});
  assert.deepEqual(pickPhotoSlots(null, ["sketch"]), {});
  assert.deepEqual(pickPhotoSlots("nope", ["sketch"]), {});
  assert.deepEqual(pickPhotoSlots([1, 2], ["sketch"]), {});
});

// The line the parent keeps about a profile it spawned. It has one job: to be
// worth reading in a list of three, which means naming what tells them apart.
test("a spawned duplicate names the factory it was made for", () => {
  assert.equal(
    spawnedDuplicateLine("Cropped Rib Tank — Bella", "Bella"),
    "Duplicated for Bella — Cropped Rib Tank — Bella."
  );
  assert.equal(spawnedDuplicateLine(null, "Bella"), "Duplicated for Bella.");
  // No factory is not a factory — the line still reads, it just says less.
  assert.equal(spawnedDuplicateLine("Copy", null), "Duplicated as a separate profile — Copy.");
  assert.equal(spawnedDuplicateLine(null, null), "Duplicated as a separate profile.");
  // Whitespace is not a name and not a factory.
  assert.equal(spawnedDuplicateLine("   ", "  "), "Duplicated as a separate profile.");
});

test("a spawned repurpose names the season it went into", () => {
  assert.equal(
    spawnedRepurposeLine("Cropped Rib Tank SS28", "SS28"),
    "Repurposed into SS28 — Cropped Rib Tank SS28."
  );
  assert.equal(spawnedRepurposeLine(null, "SS28"), "Repurposed into SS28.");
  assert.equal(spawnedRepurposeLine("Untitled", null), "Repurposed into a new season — Untitled.");
  assert.equal(spawnedRepurposeLine(undefined, undefined), "Repurposed into a new season.");
});
