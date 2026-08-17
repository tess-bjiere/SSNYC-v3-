/**
 * The bits of a photographer that are NOT on their images — set by the team, not
 * derived (Tess, 2026-08-17: "if they are a 'Fred at home' photographer or more
 * campaign level. Also include if they direct / do video work" + a brief client
 * list).
 *
 * There is no photographer table, so this rides in the shared `settings` jsonb
 * under one key, exactly like the curated vocabulary lists: a map from the
 * photographer's normalised name to their card. Keyed by name because that is
 * the only handle a credit gives us. A writer reads the whole map and returns a
 * new one with the other people carried through untouched, so two edits never
 * clobber each other. Pure and dependency-free — tested without a database.
 */

/** The settings row this all lives under. */
export const PHOTOGRAPHER_META_KEY = "photographers";

/** A photographer's tier at FRED. */
export type PhotographerTier = "home" | "campaign";

export type PhotographerMeta = {
  /** "home" = a FRED-at-home photographer; "campaign" = campaign-level. */
  tier: PhotographerTier | null;
  /** Medium — shoots stills, and/or moving image. */
  photo: boolean;
  video: boolean;
  /** Flagged a favourite from the thumbnail (Tess, 2026-08-17). */
  starred: boolean;
  /** A brief free-text history — brands, agencies, notable jobs (Tess renamed
   *  this from "clients" to "past work", 2026-08-17). */
  pastWork: string;
  /** Anything else — miscellaneous notes. */
  notes: string;
};

export const EMPTY_META: PhotographerMeta = {
  tier: null,
  photo: false,
  video: false,
  starred: false,
  pastWork: "",
  notes: "",
};

/** How a name becomes a key — the same lower-cased trim the directory uses, so
 *  the metadata joins to the right person. */
export function photographerKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function asObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function readOne(raw: unknown): PhotographerMeta {
  const o = asObject(raw);
  const tier = o.tier === "home" || o.tier === "campaign" ? o.tier : null;
  return {
    tier,
    photo: o.photo === true,
    video: o.video === true,
    starred: o.starred === true,
    // pastWork replaced the older "clients" field — read either so nothing set
    // before the rename is lost.
    pastWork: str(o.pastWork) || str(o.clients),
    notes: str(o.notes),
  };
}

/** One photographer's card, read defensively. Always a usable object. */
export function readPhotographerMeta(settingsValue: unknown, key: string): PhotographerMeta {
  const k = photographerKey(key);
  if (!k) return { ...EMPTY_META };
  return readOne(asObject(settingsValue)[k]);
}

/** Everyone's cards, name-key -> meta. */
export function readAllPhotographerMeta(settingsValue: unknown): Record<string, PhotographerMeta> {
  const box = asObject(settingsValue);
  const out: Record<string, PhotographerMeta> = {};
  for (const k of Object.keys(box)) out[k] = readOne(box[k]);
  return out;
}

/** True when a card carries nothing worth storing. */
export function isEmptyMeta(m: PhotographerMeta): boolean {
  return !m.tier && !m.photo && !m.video && !m.starred && !m.pastWork.trim() && !m.notes.trim();
}

/**
 * Write one photographer's card back into the map, leaving every other person's
 * untouched. An all-empty card removes its own entry rather than storing a shell.
 */
export function withPhotographerMeta(
  settingsValue: unknown,
  key: string,
  patch: Partial<PhotographerMeta>
): Record<string, unknown> {
  const k = photographerKey(key);
  const next = asObject(settingsValue);
  if (!k) return next;
  const merged = readOne({ ...readOne(next[k]), ...patch });
  if (isEmptyMeta(merged)) delete next[k];
  else
    next[k] = {
      tier: merged.tier,
      photo: merged.photo,
      video: merged.video,
      starred: merged.starred,
      pastWork: merged.pastWork,
      notes: merged.notes,
    };
  return next;
}

/** What the card's tier reads as. */
export function tierLabel(tier: PhotographerTier | null): string {
  if (tier === "home") return "FRED at home";
  if (tier === "campaign") return "Campaign";
  return "";
}
