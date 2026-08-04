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
};

export const PHOTO_SLOTS: readonly PhotoSlot[] = [
  {
    id: "model_front",
    label: "Model — front",
    hint: "Full length against the white wall. Tripod at chest height, model's feet on the tape mark.",
  },
  {
    id: "model_back",
    label: "Model — back",
    hint: "Same distance, same height, same crop as the front. Do not move the tripod between the two.",
  },
  {
    id: "flat_front",
    label: "Lay flat — front",
    hint: "Garment flat on white, shot from directly above, sleeves and hem squared.",
  },
  {
    id: "flat_back",
    label: "Lay flat — back",
    hint: "Same framing as the flat front so the pair can be shown side by side.",
  },
  {
    id: "detail",
    label: "Detail",
    hint: "Whatever the factory has to match — trim, hardware, a stitch, a finish.",
  },
] as const;

export type PhotoMap = Record<string, string>;

const SLOT_IDS: readonly string[] = PHOTO_SLOTS.map((s) => s.id);

export function isPhotoSlot(id: string): boolean {
  return SLOT_IDS.includes(id);
}

export function photoSlot(id: string): PhotoSlot | null {
  return PHOTO_SLOTS.find((s) => s.id === id) ?? null;
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

export function photoProgress(photos: PhotoMap): PhotoProgress {
  const missing = SLOT_IDS.filter((id) => !photos[id]);
  const total = SLOT_IDS.length;
  return {
    filled: total - missing.length,
    total,
    missing: [...missing],
    complete: missing.length === 0,
  };
}

/** "3 of 5 shot" / "Complete" — the one-line summary for the section header. */
export function photoProgressLabel(photos: PhotoMap): string {
  const p = photoProgress(photos);
  if (p.complete) return "Complete";
  if (p.filled === 0) return `Not shot — ${p.total} slots`;
  return `${p.filled} of ${p.total} shot`;
}
