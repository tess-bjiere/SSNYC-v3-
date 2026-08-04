// Repurposing a style into a new season (P3 #43).
//
// An evergreen style is a block that gets made again: same pattern, same
// factory, new season, new fabric, new colour. The studio's instinct is to open
// last season's profile and start overwriting it — which is how a season's dates
// and fit history get lost. So repurposing *copies the style forward* instead.
// The original stays exactly as it was shipped; the new one starts a clean
// sample cycle.
//
// What carries and what resets is the whole decision, and it is made here, in
// one pure function, so it is written down once and can be tested:
//
//   carries  — the things that describe the garment and its making: category,
//              garment, designer, brand, factory, cover image, tech pack, and
//              above all fit_notes, which is the accumulated block knowledge and
//              the actual reason to repurpose rather than start new.
//   resets   — season (this is the point), status (back to development: it is
//              being made again, not shipped), sample rounds and photography
//              (a new season is sampled and shot fresh), comments and versions.
//   blanked  — style_no. Two live styles sharing a number is how a factory ships
//              the wrong garment against a PO, so the new one is left empty for
//              a human unless one is typed in.
//
// The copy is NOT marked evergreen. The block is the evergreen thing; a season's
// expression of it is not. Left unchecked, every repurpose would breed another
// evergreen and the evergreen list would stop meaning anything.
//
// Dependency-free — its own structural types, no imports — so the tests can run
// straight off the .ts source with no bundler. See lib/styleFromRef.ts.

export type StyleSeed = {
  id: string;
  name: string;
  style_no?: string | null;
  category?: string | null;
  garment?: string | null;
  designer?: string | null;
  brand?: string | null;
  factory?: string | null;
  cover_image?: string | null;
  tech_pack_url?: string | null;
  notes?: string | null;
  fit_notes?: string | null;
  season?: string | null;
};

// What the form can override. Everything is optional: the common case is typing
// a season and nothing else.
export type RepurposeInput = {
  name?: string | null;
  season?: string | null;
  style_no?: string | null;
};

export type RepurposeDraft = {
  name: string;
  style_no: string | null;
  category: string | null;
  garment: string | null;
  designer: string | null;
  brand: string | null;
  factory: string | null;
  cover_image: string | null;
  tech_pack_url: string | null;
  notes: string | null;
  fit_notes: string | null;
  season: string | null;
  status: "development";
  evergreen: false;
};

function t(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

// How the original is referred to afterwards. The style number is what the
// factory and the PO know it by, so it goes in the parentheses when there is
// one; the season says which making of it this came from.
export function sourceLabel(src: StyleSeed): string {
  const name = t(src.name) ?? "Untitled";
  const bits = [t(src.style_no), t(src.season)].filter(Boolean).join(", ");
  return bits ? `${name} (${bits})` : name;
}

// Provenance without a schema change.
//
// There is no `cloned_from` column on `styles`, and inventing one would be a
// migration against the live studio database for the sake of a breadcrumb. The
// breadcrumb goes in the notes instead, where a person reads it, and the same
// sentence is written to the new style's first version row so it also shows up
// in the version history. If a real column is ever added, this line is what gets
// backfilled from.
export function repurposeNote(src: StyleSeed, season?: string | null): string {
  const into = t(season);
  return into
    ? `Repurposed from ${sourceLabel(src)} for ${into}.`
    : `Repurposed from ${sourceLabel(src)}.`;
}

// The new style's notes: the provenance line first, then whatever the original
// said. The original's notes often carry its own credit line ("Developed from a
// library reference: Margiela — 1990s") and that chain is worth keeping intact —
// a repurpose of a repurpose should still be traceable back to the photo.
export function carriedNotes(src: StyleSeed, season?: string | null): string {
  const prior = t(src.notes);
  const line = repurposeNote(src, season);
  return prior ? `${line}\n\n${prior}` : line;
}

// The name the copy starts with. Two rows called "Cropped Rib Tank" in the
// Development grid is a support ticket waiting to happen, so the season is
// appended when there is one. A name typed into the form always wins.
export function repurposeName(src: StyleSeed, input: RepurposeInput = {}): string {
  const typed = t(input.name);
  if (typed) return typed;

  const base = t(src.name) ?? "Untitled";
  const season = t(input.season);
  if (!season) return `${base} — repurposed`;
  // Don't stutter if the name already ends in that season.
  if (base.toLowerCase().endsWith(season.toLowerCase())) return base;
  return `${base} — ${season}`;
}

export function repurposeDraft(src: StyleSeed, input: RepurposeInput = {}): RepurposeDraft {
  const season = t(input.season);
  return {
    name: repurposeName(src, input),
    style_no: t(input.style_no),
    category: t(src.category),
    garment: t(src.garment),
    designer: t(src.designer),
    brand: t(src.brand),
    factory: t(src.factory),
    cover_image: t(src.cover_image),
    tech_pack_url: t(src.tech_pack_url),
    notes: carriedNotes(src, season),
    fit_notes: t(src.fit_notes),
    season,
    status: "development",
    evergreen: false,
  };
}
