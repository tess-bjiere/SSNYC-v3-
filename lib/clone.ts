// Repurposing a style into a new season (P3 #43).
//
// An evergreen style is a block that gets made again: same pattern, same
// factory, new season, new fabric, new colour. The studio's instinct is to open
// last season's profile and start overwriting it — which is how a season's dates
// and fit history get lost. So repurposing *copies the style forward* instead.
// The original stays exactly as it was shipped; the new one starts a clean
// sample rounds.
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
  fabric?: string | null;
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
  fabric: string | null;
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
    // Fabric carries like the other descriptions. A repurpose is often the
    // moment the fabric changes, but it is one field to clear against a
    // guaranteed blank on every remake that keeps it.
    fabric: t(src.fabric),
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


/* -----------------------------------------------------------------------------
 * Duplicating a style as it stands
 *
 * Tess, 2026-08-05, twice over:
 *
 *   "if a style is developed by multiple factories, they should have their own
 *    profile for each but provide hyperlinks to the other duplicate styles"
 *
 *   "duplicate + edit would just duplicate the style and allow the user to edit
 *    the info"
 *
 * Both are the same operation and it is NOT a repurpose. A repurpose moves a
 * block into a new season and deliberately drops the season and the style
 * number, because next season's making is a different garment on a PO. A
 * duplicate stays in the same season: it is this garment, again, described
 * again — because a second factory is developing it, or because somebody is
 * about to change three fields and wants the original left alone.
 *
 * So the differences from repurposeDraft are exactly:
 *
 *   season carries      — a duplicate is the same season by definition.
 *   colors carries      — added when the field was (repurposeDraft still does
 *                         not carry it; that is a separate question about what
 *                         a new season inherits, and not one to answer here).
 *   status carries      — a duplicate of something in production is a thing in
 *                         production at another factory, not something that has
 *                         gone back to development.
 *   factory is a choice — the whole point of the multi-factory case.
 *
 * Still not carried, and for the same reasons as a repurpose: sample rounds,
 * photography of those rounds, comments, versions. Another factory's protos are
 * its own. The technical drawing does carry, via `photos` — the caller decides
 * which slots that means, so this stays dependency-free.
 *
 * The style number carries too, and this is the one deliberate difference from
 * repurposeDraft's blanking of it. Two profiles of the same garment at two
 * factories SHOULD share a number — that is how lib/styleSiblings.ts recognises
 * them as each other, and it is how the studio already talks about them. The
 * risk repurposeDraft guards against (a factory shipping the wrong garment
 * against a PO) does not apply, because here they are the same garment.
 *
 * Nothing is deleted and nothing is modified: the original is untouched.
 */

export type DuplicateInput = {
  name?: string | null;
  style_no?: string | null;
  season?: string | null;
  /** The new factory. This is what makes a duplicate a second development. */
  factory?: string | null;
  colors?: string | null;
  /** Whatever the caller decided should come across — the sketch, in practice. */
  photos?: Record<string, unknown> | null;
};

export type DuplicateDraft = {
  name: string;
  style_no: string | null;
  category: string | null;
  garment: string | null;
  fabric: string | null;
  colors: string | null;
  designer: string | null;
  brand: string | null;
  factory: string | null;
  cover_image: string | null;
  tech_pack_url: string | null;
  notes: string | null;
  fit_notes: string | null;
  season: string | null;
  status: string;
  evergreen: false;
  photos: Record<string, unknown> | null;
};

/** A seed plus the two fields a repurpose does not carry. */
export type DuplicateSeed = StyleSeed & {
  colors?: string | null;
  status?: string | null;
};

/**
 * The provenance line. Names the factory when there is a new one, because
 * "why does this exist twice" is the question somebody will ask in six weeks
 * and the answer should be on the page rather than in somebody's memory.
 */
/**
 * The line written on the ORIGINAL when it spawns a separate profile.
 *
 * Tess, 2026-08-05: "versions listed should hyperlink to new proifle."
 *
 * Duplicate + edit and Repurpose both make a whole new style, and until now
 * both left the style they came from with nothing to say about it. The new
 * profile knew its parent — the provenance line is in its notes and its first
 * version — but the parent did not know its children, so the Versions list on
 * the style you were actually looking at had nothing to link to.
 *
 * These two sentences are that record. They are written from the parent's point
 * of view and they name the thing that distinguishes the child, because a list
 * of three entries all reading "Duplicated" is not a list, it is a shrug.
 *
 * Pure and tested, like everything else in this file. The link itself is the
 * spawned_style_id column; this is only what the link says.
 */
export function spawnedDuplicateLine(name: string | null | undefined, factory: string | null | undefined): string {
  const at = t(factory);
  const called = t(name);
  const who = at ? `for ${at}` : "as a separate profile";
  return called ? `Duplicated ${who} — ${called}.` : `Duplicated ${who}.`;
}

/** The same, for a repurpose into a new season. */
export function spawnedRepurposeLine(name: string | null | undefined, season: string | null | undefined): string {
  const into = t(season);
  const called = t(name);
  const who = into ? `into ${into}` : "into a new season";
  return called ? `Repurposed ${who} — ${called}.` : `Repurposed ${who}.`;
}

export function duplicateNote(src: DuplicateSeed, factory?: string | null): string {
  const at = t(factory);
  const theirs = t(src.factory);
  return at && at.toLowerCase() !== (theirs ?? "").toLowerCase()
    ? `Duplicate of ${sourceLabel(src)} for ${at}.`
    : `Duplicate of ${sourceLabel(src)}.`;
}

/**
 * The name the duplicate starts with.
 *
 * At a new factory the factory goes in the name, because the grid shows names
 * and two identical ones is the exact confusion this feature exists to prevent.
 * Otherwise it is "— copy", which is honest and obviously temporary.
 */
export function duplicateName(src: DuplicateSeed, input: DuplicateInput = {}): string {
  const typed = t(input.name);
  if (typed) return typed;

  const base = t(src.name) ?? "Untitled";
  const at = t(input.factory);
  const theirs = t(src.factory);
  if (at && at.toLowerCase() !== (theirs ?? "").toLowerCase()) {
    if (base.toLowerCase().endsWith(at.toLowerCase())) return base;
    return `${base} — ${at}`;
  }
  return `${base} — copy`;
}

export function duplicateDraft(src: DuplicateSeed, input: DuplicateInput = {}): DuplicateDraft {
  const factory = t(input.factory) ?? t(src.factory);
  const prior = t(src.notes);
  const line = duplicateNote(src, input.factory);
  return {
    name: duplicateName(src, input),
    // The typed number wins; otherwise the original's, deliberately. See above.
    style_no: t(input.style_no) ?? t(src.style_no),
    category: t(src.category),
    garment: t(src.garment),
    fabric: t(src.fabric),
    colors: t(input.colors) ?? t(src.colors),
    designer: t(src.designer),
    brand: t(src.brand),
    factory,
    cover_image: t(src.cover_image),
    tech_pack_url: t(src.tech_pack_url),
    notes: prior ? `${line}\n\n${prior}` : line,
    fit_notes: t(src.fit_notes),
    // The season carries — a duplicate is the same season. A typed one still
    // wins, so the modal can double as "same garment, next season" if somebody
    // uses it that way.
    season: t(input.season) ?? t(src.season),
    status: t(src.status) ?? "development",
    // A duplicate is not a second evergreen block, for the same reason a
    // repurpose is not. The block is evergreen; its makings are not.
    evergreen: false,
    photos: input.photos && Object.keys(input.photos).length ? input.photos : null,
  };
}

/**
 * Pick just these keys out of a photos map.
 *
 * Used to carry the technical drawing onto a duplicate and nothing else. The
 * photos jsonb holds four different things in one object (fixed slots, the
 * gallery list, the round shots, and the annotation map — see lib/photoSlots.ts
 * and lib/imageNotes.ts), and a duplicate that inherited all of it would arrive
 * carrying another factory's sample photographs and the notes written on them.
 *
 * Keys that are not there are not invented, and only strings are taken, so this
 * can never drag a list or a notes map across by accident.
 */
export function pickPhotoSlots(
  photos: unknown,
  slotIds: readonly string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!photos || typeof photos !== "object" || Array.isArray(photos)) return out;
  const src = photos as Record<string, unknown>;
  for (const id of slotIds) {
    const v = src[id];
    if (typeof v === "string" && v.trim()) out[id] = v.trim();
  }
  return out;
}
