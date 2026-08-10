// Turning a library reference into a style profile.
//
// This is the join the whole rebuild exists for: a photo in the library stops
// being inspiration and becomes something being made. The link itself lives in
// the `style_references` table (style_id, reference_id) — a join, not a copy,
// so the reference is never duplicated, moved or edited by being developed
// from. Delete the style and the reference is untouched; the join row is the
// only thing that goes.
//
// What a *new* style inherits from its reference is decided here, in one pure
// function, so it can be tested and so the rule is written down in one place.

// The subset of a reference this module reads, described structurally rather
// than imported from lib/types.ts — the same shape lib/storage.ts uses, and for
// the same reason: every tested module here stays dependency-free so the tests
// can run straight off the .ts source with no bundler. It makes the tests honest
// too: nothing else about the reference is consulted, let alone written back.
export type ReferenceSeed = {
  designer?: string | null;
  year?: string | null;
  season?: string | null;
  category?: string | null;
  garment?: string | null;
  fabric?: string | null;
  color?: string | null;
  image_url?: string | null;
  image?: string | null;
  thumb_url?: string | null;
  thumb?: string | null;
};

export type StyleDraft = {
  name: string;
  category: string | null;
  garment: string | null;
  fabric: string | null;
  season: string | null;
  cover_image: string | null;
  notes: string | null;
  status: "development";
};

function t(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

// The cover image, picked with the same precedence `refImage` in lib/types.ts
// uses for a detail view: full image first, thumbnail only as a last resort, so
// a style's cover is never needlessly the 7 KB version. Restated here rather
// than imported to keep this module self-contained; the order is pinned by a
// test so the two cannot drift apart unnoticed.
function coverImage(r: ReferenceSeed): string | null {
  return t(r.image_url) ?? t(r.image) ?? t(r.thumb_url) ?? t(r.thumb);
}

// The credit line recorded in the new style's notes.
//
// The reference's designer is the house that made the *inspiration* — Margiela,
// The Row — not the person at this studio who owns the style. So it deliberately
// does NOT become the style's `designer` field, which would quietly mislabel
// every style as somebody else's. It goes in the notes as provenance instead,
// and `designer`, `brand`, `factory` and `style_no` are left blank for a human
// to fill in.
export function sourceNote(r: ReferenceSeed): string | null {
  const who = t(r.designer);
  const when = [t(r.year), t(r.season)].filter(Boolean).join(", ");
  if (!who && !when) return null;
  const tail = who ? (when ? `${who} — ${when}` : who) : when;
  return `Developed from a library reference: ${tail}.`;
}

// The name a new style starts with. The garment is the most useful handle
// ("Knit Top"), the category the fallback ("Outerwear"), and failing both a
// neutral placeholder — never the reference's designer, for the reason above.
export function draftName(r: ReferenceSeed): string {
  return t(r.garment) ?? t(r.category) ?? "New style";
}

// Everything a new style inherits. Category, garment and season describe the
// garment itself and carry over; the image becomes the cover so the profile is
// recognisable in the Development grid straight away.
//
// Status starts at "development" rather than "inspo": the reference was the
// inspo stage, and the action that calls this is literally "Develop this".
export function styleDraftFromReference(r: ReferenceSeed): StyleDraft {
  return {
    name: draftName(r),
    category: t(r.category),
    garment: t(r.garment),
    // The library has always recorded what a reference was made in. A style
    // developed from a silk slip starts in silk rather than starting blank —
    // and it is editable the moment it is wrong.
    fabric: t(r.fabric),
    season: t(r.season),
    cover_image: coverImage(r),
    notes: sourceNote(r),
    status: "development",
  };
}
