// What a style looks like when it is only one picture wide.
//
// Tess, 2026-08-05: "the sketch or flat should be the profile picture of the
// style. You should be able to add front and back images."
//
// Until now the profile picture was styles.cover_image — a single URL, usually
// inherited from the library reference the style was developed from. That is
// the wrong picture. A reference is what a style was *inspired by*; showing it
// on the development grid means every style wears somebody else's photograph
// until the day it is shot, and two styles developed from the same reference
// are indistinguishable in the grid.
//
// The sketch is the first true picture of a style — it exists before the
// garment does — and the lay-flat is the first true photograph of it. So the
// face of a style is resolved, in this order:
//
//   1. Sketch          — front, then back
//   2. Lay flat        — front, then back
//   3. Model           — front, then back
//   4. cover_image     — whatever was pasted or inherited
//   5. nothing
//
// cover_image is not deleted and not ignored: it is the fallback, and it is
// still editable on the profile. A style with no drawing and no shoot looks
// exactly as it did before. A style that gains a sketch starts wearing its own
// face. That is the whole change.
//
// FRONT AND BACK. The three families above are pairs, and the pair is resolved
// together: whichever family supplies the front supplies the back. A sketched
// front with a photographed back would read as two different garments, and the
// point of a front/back pair is that they are the same one. If the chosen
// family has no back yet, there is no back — the profile says so rather than
// borrowing one.
//
// The detail shot is deliberately not in the list. It is a picture *of* a
// style, not a picture that *is* one, and a close-up of a zip identifies
// nothing in a grid.
//
// Dependency-free on purpose: own structural types, no imports, so node's test
// runner can load it directly. The slot ids here must stay in step with
// lib/photoSlots.ts — the pairing test in lib/styleCover.test.mts asserts every
// id used here is a real slot, so drift fails the suite rather than the page.

/** Only the two fields that decide a style's face. */
export type CoverStyle = {
  cover_image?: string | null;
  /** The raw styles.photos jsonb, read defensively — never trust its shape. */
  photos?: unknown;
};

export type FaceFamily = {
  id: string;
  /** How the pair is described when the profile says where its face came from. */
  label: string;
  front: string;
  back: string;
};

// Order is precedence. Moving a line here changes what every style in the
// studio looks like at a glance, so it is a deliberate act.
export const FACE_FAMILIES: readonly FaceFamily[] = [
  { id: "sketch", label: "Sketch", front: "sketch", back: "sketch_back" },
  { id: "flat", label: "Lay flat", front: "flat_front", back: "flat_back" },
  { id: "model", label: "Model", front: "model_front", back: "model_back" },
] as const;

export type Face = {
  url: string;
  /** The slot this came from, or "cover_image" for the fallback. */
  slotId: string;
  /** "Sketch — front", "Lay flat — back", "Cover image". */
  label: string;
  side: "front" | "back";
};

export type StyleFaces = {
  front: Face | null;
  back: Face | null;
  /** Which family the pair came from, or null when it is the fallback. */
  family: string | null;
  source: "family" | "cover" | "none";
};

/**
 * Read the raw jsonb into slot id -> non-empty url, tolerating everything the
 * column will actually contain over the life of the tool: null, {}, arrays,
 * numbers, blank strings left by someone clearing a field, and the gallery
 * array that shares the same map. Anything that is not a non-empty string is
 * absent.
 *
 * This duplicates a few lines of normalizePhotos rather than importing it,
 * because this module has to stay dependency-free to be unit-testable. It is
 * more permissive on purpose: it does not care which slot ids exist, only the
 * handful it looks up by name.
 */
function readMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const url = v.trim();
    if (url) out[k] = url;
  }
  return out;
}

function face(url: string, slotId: string, label: string, side: "front" | "back"): Face {
  return { url, slotId, label, side };
}

/**
 * The front and back pictures of a style.
 *
 * A family is chosen if it holds *either* side, not only if it holds the front.
 * Somebody who has drawn the back and not the front has still drawn this style,
 * and the back standing alone in the front position is a truer profile picture
 * than a reference photograph of a different garment.
 */
export function styleFaces(style: CoverStyle | null | undefined): StyleFaces {
  const none: StyleFaces = { front: null, back: null, family: null, source: "none" };
  if (!style) return none;

  const map = readMap(style.photos);

  for (const fam of FACE_FAMILIES) {
    const f = map[fam.front];
    const b = map[fam.back];
    if (!f && !b) continue;
    return {
      front: f ? face(f, fam.front, `${fam.label} — front`, "front") : null,
      back: b ? face(b, fam.back, `${fam.label} — back`, "back") : null,
      family: fam.id,
      source: "family",
    };
  }

  const cover = (style.cover_image ?? "").trim();
  if (cover) {
    return {
      front: face(cover, "cover_image", "Cover image", "front"),
      back: null,
      family: null,
      source: "cover",
    };
  }

  return none;
}

/**
 * The one picture — for a grid thumbnail, a shot-list row, an AI source image.
 *
 * Falls to the back when there is no front, so a style whose only drawing is a
 * back view still shows in the grid rather than reading as never started.
 */
export function styleCoverUrl(style: CoverStyle | null | undefined): string | null {
  const f = styleFaces(style);
  return f.front?.url ?? f.back?.url ?? null;
}

/** Where the profile picture came from — shown under it so it is never a mystery. */
export function styleCoverLabel(style: CoverStyle | null | undefined): string | null {
  const f = styleFaces(style);
  return f.front?.label ?? f.back?.label ?? null;
}

/**
 * The style's photo map with a sample round's photo map laid over it.
 *
 * Tess, 2026-08-05: "photography should not be it's own section, it needs to
 * live within the specific sample round." The five shoot slots are filled per
 * round now, which means the newest photograph of a garment is on the newest
 * round and not on the style — and the face of a style has to be the newest
 * true picture of it, or the development grid keeps showing the 1st proto after
 * the PPS has landed.
 *
 * The round wins where both hold the same slot, because a later round IS the
 * later photograph. Everything the style already holds is kept: the sketch
 * lives on the style and always did, every shoot filed before photography moved
 * onto rounds is still in this map, and nothing is written anywhere by reading
 * it. A style with no rounds resolves exactly as it did before.
 *
 * Precedence is untouched — the merge happens before FACE_FAMILIES is walked,
 * so a sketch on the style still outranks a lay flat on the round. The layering
 * decides *which* lay flat, never whether a lay flat beats a drawing.
 */
export function withRoundPhotos(
  style: CoverStyle | null | undefined,
  roundPhotos: unknown
): CoverStyle {
  return {
    cover_image: style?.cover_image ?? null,
    photos: { ...readMap(style?.photos), ...readMap(roundPhotos) },
  };
}

/** Every slot id that can become a face, in precedence order. */
export function faceSlotIds(): string[] {
  const out: string[] = [];
  for (const fam of FACE_FAMILIES) out.push(fam.front, fam.back);
  return out;
}
