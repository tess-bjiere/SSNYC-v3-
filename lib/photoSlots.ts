// The photography standard, as data (P3 #39).
//
// The studio's problem was never "we have no photos" — it was that every style
// was shot slightly differently, so two styles could not be compared and a
// factory could not be shown a like-for-like. So the slots are fixed here in
// code rather than left to whoever is holding the camera, and each one carries
// the shooting note that makes it repeatable.
//
// Storage is a jsonb map on styles.photos keyed by slot id:
//   { "model_front": "https://…", "flat_front": "https://…" }
// A new slot is a change to this list and never another migration. Removing a
// slot from this list hides it but does not destroy the stored URL — see
// normalizePhotos, which drops unknown keys on read but never writes.
//
// This module is deliberately dependency-free so it can be unit-tested directly
// by node's test runner.

export type PhotoSlot = {
  id: string;
  label: string;
  /** The one instruction that makes this shot match every other style's. */
  hint: string;
  /**
   * Shootable, named and stored like any other slot — but not counted.
   *
   * An optional slot never appears on the shot list, never holds a style back
   * from "Complete", and never turns the photography page amber. It exists for
   * the shot that is worth having a proper named place for and is not worth
   * chasing every style for. See photoProgress.
   */
  optional?: boolean;
  /**
   * The family this shot belongs to — "model", "flat", "detail".
   *
   * Only optional slots use it, and only for one purpose: an empty optional
   * slot is offered one family at a time, so eleven cards (six of them blank)
   * never appear on a round that has two photographs on it. See visibleSlots.
   */
  group?: string;
  /**
   * Slots that appear and disappear together. Defaults to the slot's own id.
   *
   * A second lay flat is a FRONT AND A BACK — offering the front on its own
   * and only revealing the back once the front is up would produce a lay flat
   * with no reverse, which is the one thing a lay flat is for. So the pair
   * shares a unit and is offered as a pair. A second detail has no such
   * partner and is its own unit.
   */
  unit?: string;
  /**
   * Kept so what was shot into it still shows, never offered again.
   *
   * The house rule everywhere in this tool is that nothing is deleted, only
   * stopped being read. Taking a slot out of this list entirely would satisfy
   * "remove it from the screen" and would also make normalizePhotos drop the
   * key on read — so a photograph already filed there would silently stop
   * existing, which is the one outcome that is never acceptable.
   *
   * A retired slot therefore stays in the standard, stays readable, stays
   * writable, and stays out of REQUIRED_SLOTS — visibleSlots simply never
   * offers an empty one. It appears only where it already holds a picture.
   */
  retired?: boolean;
};

// The shoot list. This is the standard, it is what /photography counts, and it
// is what the export prints. Adding to it changes what every style in the
// studio is measured against, so it is a deliberate act.
//
// It grew on 2026-08-05 (Tess: "add model side shot and additional detail
// shot"). Two shots, added two different ways, and the difference is the whole
// argument:
//
//   Model — side   part of the standard. Three views of a garment on a body is
//                  the set; two is a gap. Every style shot before today will
//                  now read one short, which is correct and is the shot list
//                  doing its job — it is telling the truth about what exists.
//
//   Detail 2       optional. "Additional" was the word, and a second detail is
//                  by nature the shot that some garments need and most do not.
//                  Making it count would have marked every simple style
//                  incomplete forever over a photograph nobody wanted, and a
//                  list that cries wolf stops being read.
//
// Flipping either one is a single word here — nothing else in the app decides
// what counts.
//
// It grew again the same day (Tess: "have 4 detail shots and 2 then 2 layflat
// shots"). Read as: room for four details, and the lay flats as two pairs —
// four in all. "2 then 2" is a pair and then another pair, because a lay flat
// is always a front and a back, and two loose extra flats would be the only
// unpaired flats in the tool.
//
// Everything added here is optional. The standard a style is measured against
// did not change: one detail and one pair of flats is still what a style owes.
// Making four details compulsory would mark every simple garment permanently
// incomplete, and a shot list that cries wolf stops being read. What these
// slots buy is a NAMED, ordered place for the extra shots — so the fourth
// detail of a jacket is in the same position on every jacket, instead of being
// the ninth thing in a gallery pile.
//
// And they do not all show at once. An empty optional slot is offered one at a
// time per family, so a round with two photographs on it shows one spare detail
// card and one spare pair of flats — not six blank cards. See visibleSlots.
//
// The second pair of flats came back off the same day (Tess, 2026-08-05:
// "second layflat options should just be detial shots"). In practice a garment
// only lies flat one way that is worth photographing; what people were actually
// reaching for the spare flat cards to hold was another close-up. So the two
// extra named places moved to where they were being used: the detail family
// goes to six, and the flats go back to one front and one back.
//
// The pair is retired rather than deleted (see `retired` on PhotoSlot). Any
// round that already has a second lay flat on it still shows it, still reads
// it, still exports it — it is simply never offered as an empty card again. A
// photograph that exists is never hidden, which is the rule the whole grid runs
// on and the reason nothing had to be migrated to make this change.
export const PHOTO_SLOTS: readonly PhotoSlot[] = [
  {
    id: "model_front",
    label: "Model — front",
    hint: "Full length against the white wall. Tripod at chest height, model's feet on the tape mark.",
    group: "model",
  },
  {
    id: "model_back",
    label: "Model — back",
    hint: "Same distance, same height, same crop as the front. Do not move the tripod between the two.",
    group: "model",
  },
  {
    id: "model_side",
    label: "Model — side",
    hint: "Quarter turn from the front, same distance and height as the other two. Arms down, hands still.",
    group: "model",
  },
  // The lay flats are gone (Tess, 2026-08-10: "remove layflat options for sample
  // images, it should be 3 model shots (front, back, side) and 3 detail shots",
  // and then, on seeing them still appear where they had been shot: "still too
  // many image thumbnails for sample uploads … no layflats").
  //
  // Removed from the list entirely rather than marked `retired`. Retired keeps a
  // slot showing wherever it already holds a picture, which is exactly what was
  // still putting two lay-flat cards on this round — and that is the thing Tess
  // is asking to stop. Taking the slot out of the list stops it being shown at
  // all, filled or empty.
  //
  // This is the one place the module header's "hides it but does not destroy the
  // stored URL" is used on purpose. normalizePhotos drops the flat_front /
  // flat_back / flat2_* keys on read so nothing renders them, but writePhotos
  // still copies every key it does not recognise, so the URLs stay in the jsonb
  // untouched: no round was edited, nothing was migrated, and re-adding these
  // slots later would bring every stored lay flat straight back. The `flat`
  // family in lib/styleCover.ts is left alone, so a style whose only picture is a
  // lay flat still has a grid face.
  {
    id: "detail",
    label: "Detail",
    hint: "Whatever the factory has to match — trim, hardware, a stitch, a finish.",
    group: "detail",
  },
  {
    id: "detail_2",
    label: "Detail 2",
    hint: "The second thing worth a close-up — a lining, a label, a closure. Only where there is one.",
    group: "detail",
    optional: true,
  },
  {
    id: "detail_3",
    label: "Detail 3",
    hint: "A third close-up — a pocket bag, a vent, a zip pull. Same light as the others.",
    group: "detail",
    optional: true,
  },
  // Details 4 through 8 are retired (Tess, 2026-08-10: "3 detail shots"). The
  // named places stop at three — Detail, Detail 2, Detail 3 — so an empty
  // fourth detail card is never offered again. Retired, not deleted: a round
  // that already has a fourth, fifth or sixth close-up on it keeps showing it,
  // exactly like the lay flats above. Anything beyond three now lives in the
  // gallery pile below the slots rather than in a named box.
  {
    id: "detail_4",
    label: "Detail 4",
    hint: "A fourth close-up — a cuff, a seam finish, a hem. Same light as the others.",
    group: "detail",
    optional: true,
    retired: true,
  },
  {
    id: "detail_5",
    label: "Detail 5",
    hint: "A fifth close-up — hardware, a branded tape, an inside finish.",
    group: "detail",
    optional: true,
    retired: true,
  },
  {
    id: "detail_6",
    label: "Detail 6",
    hint: "A sixth close-up — hardware, a branded tape, an inside finish.",
    group: "detail",
    optional: true,
    retired: true,
  },
  {
    id: "detail_7",
    label: "Detail 7",
    hint: "A seventh close-up — a drawcord, an eyelet, a bar tack.",
    group: "detail",
    optional: true,
    retired: true,
  },
  {
    id: "detail_8",
    label: "Detail 8",
    hint: "The eighth and last named detail. Anything beyond this belongs in the images below.",
    group: "detail",
    optional: true,
    retired: true,
  },
] as const;

// Slots that are NOT part of the shoot.
//
// A sketch is an input to development, not an output of a photo session — it
// exists before the garment does. It lives in the same styles.photos map
// because that is where a single image keyed by a name belongs, and putting it
// anywhere else would have cost a column for one URL. But it is kept out of
// PHOTO_SLOTS so it never appears on the shot list, never counts against
// "3 of 5 shot", and never turns the photography page amber for a style that
// has simply not been drawn.
//
// The sketch became a PAIR on 2026-08-05 (Tess: "You should be able to add
// front and back images"). Every other view of a garment in this tool is a
// front and a back — the flats are, the model shots are — and the drawing was
// the one thing that could only be seen from one side, which meant a back-neck
// detail or a back yoke had nowhere to live but the gallery pile.
//
// The front keeps the id "sketch" rather than becoming "sketch_front". It is
// worth an inconsistency in the id list: every sketch already drawn is stored
// under that key, and renaming it would have meant either a data migration or a
// silent disappearance. The label carries the change; the data does not move.
export const DESIGN_SLOTS: readonly PhotoSlot[] = [
  // "Front" and "Back", not "Sketch — front" and "Sketch — back": the section
  // these two cards sit in is called Sketch (Tess, 2026-08-05: "change design
  // to sketch"), and a card that repeats its own section header three times on
  // one screen is noise. The full names still exist where they have to stand
  // alone — the caption on the profile picture, in lib/styleCover.ts.
  {
    id: "sketch",
    label: "Front",
    hint: "The flat, the croquis, the drawing the tech pack was built from.",
  },
  {
    id: "sketch_back",
    label: "Back",
    hint: "The back view of the same drawing — yoke, seams, whatever the front cannot show.",
  },
  // The linesheet presentation images (Tess, 2026-08-24: "new image slots" for
  // the market-deck layouts). Each is its OWN slot with its own upload, and the
  // reference layouts show it only where they name it — a missing styled photo or
  // croquis is left blank, never filled with the technical sketch above ("do not
  // automatically fill it in with the technical sketch"). Design slots, so they
  // are never part of the shoot and never count against a style's photo progress.
  {
    id: "styled",
    label: "Styled photo",
    hint: "The self-styled or model shot for the linesheet — a person wearing the piece.",
  },
  {
    id: "croquis",
    label: "Croquis — front",
    hint: "The fashion illustration, front — the drawing on a figure, not the flat sketch.",
  },
  {
    id: "croquis_back",
    label: "Croquis — back",
    hint: "The croquis from the back — the same illustration turned around.",
  },
] as const;

/** Every slot the map may legitimately hold, shoot and design together. */
export const ALL_SLOTS: readonly PhotoSlot[] = [...PHOTO_SLOTS, ...DESIGN_SLOTS];

/**
 * The shots that count — the shoot list minus anything marked optional.
 *
 * This is what progress is measured against and what the photography rollout
 * charts. An optional slot is still shot, still stored and still shown on the
 * style; it simply is not something a style can be behind on.
 */
export const REQUIRED_SLOTS: readonly PhotoSlot[] = PHOTO_SLOTS.filter((s) => !s.optional);

export type PhotoMap = Record<string, string>;

/** Slots that appear and disappear together. Its own id unless it says otherwise. */
function unitOf(slot: PhotoSlot): string {
  return slot.unit ?? slot.id;
}

/**
 * The cards actually worth putting on the screen, in standard order.
 *
 * Every required slot, always — an empty required card IS the shot list, and
 * hiding it would be hiding the work. Every optional slot that holds a
 * photograph, because a picture that exists is never hidden. And every LIVE
 * (non-retired) optional slot that is empty, so all of them are there to fill.
 *
 * This used to offer only one empty optional unit per family, growing the grid
 * one card at a time — a guard against a round sprouting a dozen blank boxes
 * back when there were eight details and four pairs of flats. The standard is
 * now three model shots and three details (Tess, 2026-08-10), so the entire
 * optional set is at most two empty cards; hiding one of them behind the other
 * just meant a third detail slot you could not see until the second was full
 * ("add detail 3 optional image slot"). So all live optional slots show now.
 *
 * A retired unit is still never offered as an empty card — it appears only where
 * it already holds a picture. A list with no optional slots in it comes back
 * untouched, so the design slots and the filed view pass straight through.
 */
export function visibleSlots(slots: readonly PhotoSlot[], photos: PhotoMap): PhotoSlot[] {
  // A unit counts as used the moment any one of its slots holds a picture.
  const used = new Set<string>();
  for (const s of slots) if (photos[s.id]) used.add(unitOf(s));

  // Every unused live optional unit is offered. A retired unit is skipped, so it
  // shows only through `used` above — where it already holds a photograph.
  const offered = new Set<string>();
  for (const s of slots) {
    if (!s.optional || s.retired) continue;
    const u = unitOf(s);
    if (!used.has(u)) offered.add(u);
  }

  return slots.filter((s) => {
    if (!s.optional) return true;
    const u = unitOf(s);
    return used.has(u) || offered.has(u);
  });
}

const SHOOT_IDS: readonly string[] = REQUIRED_SLOTS.map((s) => s.id);
const SLOT_IDS: readonly string[] = ALL_SLOTS.map((s) => s.id);

export function isPhotoSlot(id: string): boolean {
  return SLOT_IDS.includes(id);
}

export function photoSlot(id: string): PhotoSlot | null {
  return ALL_SLOTS.find((s) => s.id === id) ?? null;
}

/**
 * Read a stored photos value into a clean map.
 *
 * jsonb arrives as whatever was written, which over the life of the tool will
 * include null, `{}`, keys for slots that no longer exist, and blank strings
 * left behind by someone clearing a field. All of those normalise to "absent"
 * so the rest of the code only ever sees slot id -> non-empty URL.
 */
export function normalizePhotos(raw: unknown): PhotoMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PhotoMap = {};
  for (const id of SLOT_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v !== "string") continue;
    const url = v.trim();
    if (url) out[id] = url;
  }
  return out;
}

/**
 * Set or clear one slot, returning a new map. A blank url clears the slot
 * rather than storing an empty string, so "cleared" and "never shot" are the
 * same state everywhere downstream. An unknown slot id is ignored — a stale
 * form post can never write a key the standard does not define.
 */
export function withPhoto(photos: PhotoMap, slotId: string, url: string | null | undefined): PhotoMap {
  if (!isPhotoSlot(slotId)) return { ...photos };
  const next = { ...photos };
  const clean = (url ?? "").trim();
  if (clean) next[slotId] = clean;
  else delete next[slotId];
  return next;
}

export type PhotoProgress = {
  filled: number;
  total: number;
  /** Slot ids still to shoot, in standard order — this is the shot list. */
  missing: string[];
  complete: boolean;
};

// Progress is measured against the required shots only. A style with no sketch
// is not an unfinished shoot, and neither is one without a second detail —
// see the optional flag on PhotoSlot.
export function photoProgress(photos: PhotoMap): PhotoProgress {
  const missing = SHOOT_IDS.filter((id) => !photos[id]);
  const total = SHOOT_IDS.length;
  return {
    filled: total - missing.length,
    total,
    missing: [...missing],
    complete: missing.length === 0,
  };
}

/**
 * Set or clear one slot in the RAW stored jsonb, returning a new raw object.
 *
 * This is what the server action writes through, and it is deliberately not
 * withPhoto. withPhoto operates on a normalised map, and a normalised map has
 * already dropped every key the slot list does not define — so writing one back
 * would silently delete the gallery, and any key a later version of this file
 * adds, every time somebody replaced a single photograph. The module header
 * promises normalizePhotos "drops unknown keys on read but never writes"; this
 * function is what makes that true on the write side too.
 *
 * An unknown slot id is still refused, so a hand-made form post cannot invent
 * a key — but an unknown key already in the map is left exactly where it is.
 */
export function writePhotos(
  raw: unknown,
  slotId: string,
  url: string | null | undefined
): Record<string, unknown> {
  const base: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  if (!isPhotoSlot(slotId)) return base;
  const clean = (url ?? "").trim();
  if (clean) base[slotId] = clean;
  else delete base[slotId];
  return base;
}

/**
 * "3 of 5 shot" / "" — the one-line summary for the section header.
 *
 * A finished round says nothing (Tess, 2026-08-06: "remove complete", on the
 * "SAMPLE IMAGES  COMPLETE" heading). The label exists to say what is still
 * missing; once nothing is, the word is a badge for having done the ordinary
 * thing, and every finished style carried one at the top of its biggest
 * section. The empty string is what the header already renders as nothing.
 */
export function photoProgressLabel(photos: PhotoMap): string {
  const p = photoProgress(photos);
  if (p.complete) return "";
  if (p.filled === 0) return `Not shot — ${p.total} slots`;
  return `${p.filled} of ${p.total} shot`;
}
