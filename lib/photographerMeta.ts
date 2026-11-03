/**
 * The bits of a photographer that are NOT on their images — set by the team, not
 * derived (Tess, 2026-08-17: "if they are a[n] 'at home' photographer or more
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

/** A photographer's tier. */
export type PhotographerTier = "home" | "campaign";

export type PhotographerMeta = {
  /** "home" = an at-home photographer; "campaign" = campaign-level. */
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
  /** A hand-set order of this photographer's image reference ids (Tess,
   *  2026-08-17: "easy reorder of images ... by dragging"). Ids missing from the
   *  list fall to the end in their default order, so it survives new uploads. */
  imageOrder: string[];
  /**
   * The section a person is filed under — for a photographer the deck's own
   * grouping (Movement, Portrait & studio, Documentary & atmosphere, Behind the
   * scenes, Directors), for a model "Shortlist" or "Casting reference" (Tess,
   * 2026-11-02: "add photographers to ssync from deck" + "create a space for
   * potential models"). Free text, so a new group is just typed.
   */
  group: string;
  /** What they do, in a word or two — "Director of photography", "Photographer
   *  and director". Free text. */
  role: string;
  /** Models only, in practice: the age as last checked, and the agency. Free
   *  text because the sources give "~32" and "34" alike. */
  age: string;
  agency: string;
};

export const EMPTY_META: PhotographerMeta = {
  tier: null,
  photo: false,
  video: false,
  starred: false,
  pastWork: "",
  notes: "",
  imageOrder: [],
  group: "",
  role: "",
  age: "",
  agency: "",
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
    imageOrder: Array.isArray(o.imageOrder)
      ? o.imageOrder.filter((x): x is string => typeof x === "string")
      : [],
    group: str(o.group),
    role: str(o.role),
    age: str(o.age),
    agency: str(o.agency),
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
  return (
    !m.tier && !m.photo && !m.video && !m.starred &&
    !m.pastWork.trim() && !m.notes.trim() && m.imageOrder.length === 0 &&
    !m.group.trim() && !m.role.trim() && !m.age.trim() && !m.agency.trim()
  );
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
      imageOrder: merged.imageOrder,
      group: merged.group,
      role: merged.role,
      age: merged.age,
      agency: merged.agency,
    };
  return next;
}

/**
 * Fill in a card from an import without overwriting anything the team has
 * already set (Tess, 2026-11-02: the deck's photographers and models brought into
 * SSYNC). A field is only written when the card's own value is blank — an empty
 * string, false, null or an empty order — so running an import twice, or after
 * someone has edited a card, never undoes their edit.
 */
export function withPhotographerMetaDefaults(
  settingsValue: unknown,
  key: string,
  defaults: Partial<PhotographerMeta>
): Record<string, unknown> {
  const current = readPhotographerMeta(settingsValue, key);
  const patch: Partial<PhotographerMeta> = {};
  for (const k of Object.keys(defaults) as (keyof PhotographerMeta)[]) {
    const have = current[k];
    const blank =
      have === null || have === false || have === "" ||
      (Array.isArray(have) && have.length === 0);
    if (blank) (patch as Record<string, unknown>)[k] = defaults[k];
  }
  return withPhotographerMeta(settingsValue, key, patch);
}

/** What the card's tier reads as. */
export function tierLabel(tier: PhotographerTier | null): string {
  if (tier === "home") return "At home";
  if (tier === "campaign") return "Campaign";
  return "";
}

// ---------------------------------------------------------------------------
// The card as a person record holds it (2026-11-02, people phase 1). Since the
// `people` table (db/p30) a card is no longer one entry in a name-keyed settings
// map but the `card` jsonb on that person's own row — so there is no map to
// carry other people through, and the key is the person's id, not their name.
// Same fields, same defensive read, same "an all-empty card stores nothing".
// ---------------------------------------------------------------------------

/** A person's card, read defensively from their `card` column. */
export function readCard(raw: unknown): PhotographerMeta {
  return readOne(raw);
}

/** A card with `patch` applied, in the stored shape ({} when it says nothing). */
export function mergeCard(raw: unknown, patch: Partial<PhotographerMeta>): Record<string, unknown> {
  return (withPhotographerMeta({ k: raw }, "k", patch).k ?? {}) as Record<string, unknown>;
}

/**
 * A card with `defaults` written only where it is blank — the import rule
 * (withPhotographerMetaDefaults) for a single card. Also how two people are
 * merged: the person kept wins every field they have filled in.
 */
export function cardWithDefaults(raw: unknown, defaults: Partial<PhotographerMeta>): Record<string, unknown> {
  return (withPhotographerMetaDefaults({ k: raw }, "k", defaults).k ?? {}) as Record<string, unknown>;
}
