// The moodboard colour palette (Tess, 2026-08-12: "add color palette section to
// moodboard -- allows user to fill in seasonal and evergreen color swatches /
// pantones for easy reference").
//
// A palette belongs to a brand, not a single board: "evergreen" colours are the
// permanent brand ones, repeated across every board, and even the seasonal set
// is the season's reference rather than one concept board's. So it is stored per
// brand and shown on the moodboard page whichever board is open.
//
// Two groups, each a list of swatches. A swatch carries a hex (for the chip) and
// a free-text name (the Pantone code or a colour name) — either alone is a valid
// swatch, because somebody types a Pantone before they have picked its screen
// colour, and somebody else drops a colour they have not named yet. A swatch with
// neither is nothing, and is dropped.
//
// Dependency-free on purpose, like everything in lib/: it declares its own types
// and imports nothing, so the test runs with no build step.

// A swatch is a colour chip and a free-text name, and optionally a `image` — an
// uploaded pattern/print URL that stands in for the flat colour (Tess,
// 2026-08-12: "you can upload swatch for pattern if needed"). Any one of the
// three is enough to keep the swatch.
export type Swatch = { hex: string; name: string; image?: string };
export type Palette = { seasonal: Swatch[]; evergreen: Swatch[] };

export const PALETTE_GROUPS = [
  { key: "seasonal", label: "Seasonal" },
  { key: "evergreen", label: "Evergreen" },
] as const;

export type PaletteGroupKey = (typeof PALETTE_GROUPS)[number]["key"];

// A generous ceiling so a runaway paste cannot bloat a brand row, well above any
// real palette.
const MAX_PER_GROUP = 60;

/**
 * Coerce any input to a `#rrggbb` lowercase hex, or "" if it is not a colour.
 * Accepts a leading # or not, and expands the three-digit shorthand.
 */
export function normalizeHex(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split("").map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/.test(s)) return "#" + s;
  return "";
}

/** One swatch, cleaned. Returns null for a swatch that is neither colour nor name. */
export function normalizeSwatch(raw: unknown): Swatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const hex = normalizeHex(r.hex);
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
  const image =
    typeof r.image === "string" && r.image.trim() ? r.image.trim().slice(0, 2048) : "";
  if (!hex && !name && !image) return null;
  const sw: Swatch = { hex, name };
  if (image) sw.image = image;
  return sw;
}

function normalizeGroup(raw: unknown): Swatch[] {
  if (!Array.isArray(raw)) return [];
  const out: Swatch[] = [];
  for (const s of raw) {
    const sw = normalizeSwatch(s);
    if (sw) out.push(sw);
    if (out.length >= MAX_PER_GROUP) break;
  }
  return out;
}

/** Read whatever is in the brand row into a well-formed palette (legacy shape). */
export function normalizePalette(raw: unknown): Palette {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    seasonal: normalizeGroup(r.seasonal),
    evergreen: normalizeGroup(r.evergreen),
  };
}

// ---------------------------------------------------------------------------
// Palette library (Tess, 2026-09-09: "color palettes should be saved to a season
// and then allowed to be added to a moodboard -- not just applied to all
// moodboards as many of these would be seasonal").
//
// The one brand-global { seasonal, evergreen } palette becomes a *library*: one
// palette per season, plus an evergreen one. A board shows only the palettes it
// has been given (moodboards.palettes), so a season's colours no longer bleed
// onto every board. Still stored on the brand row — a handful of seasons of a few
// dozen swatches each — and still dependency-free.
// ---------------------------------------------------------------------------

// The reserved key for the evergreen palette; every other key is a season name
// exactly as it reads in the curated season list ("FW26", "Fall/Winter", …).
export const EVERGREEN_KEY = "evergreen";

// Where an old brand row's single, untagged `seasonal` list lands when migrated —
// it was never tied to a season, so it is preserved under a bucket Tess can
// re-file from the manager rather than dropped or guessed into a real season.
export const UNFILED_SEASON = "Unfiled";

export type PaletteLibrary = {
  evergreen: Swatch[];
  seasons: Record<string, Swatch[]>;
};

export type PaletteSlot = { key: string; label: string; swatches: Swatch[] };

/** "Evergreen" for the reserved key; otherwise the season name is its own label. */
export function slotLabel(key: string): string {
  return key === EVERGREEN_KEY ? "Evergreen" : key;
}

// Read a brand row's palette column into a well-formed library, migrating the old
// { seasonal, evergreen } shape on the way: evergreen is kept, and the untagged
// seasonal list is preserved under "Unfiled" so nothing a brand already typed is
// lost. Empty seasons are dropped — a season exists only while it holds a colour.
export function normalizePaletteLibrary(raw: unknown): PaletteLibrary {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const evergreen = normalizeGroup(r.evergreen);

  const seasons: Record<string, Swatch[]> = {};
  const rawSeasons =
    r.seasons && typeof r.seasons === "object" ? (r.seasons as Record<string, unknown>) : {};
  for (const [key, val] of Object.entries(rawSeasons)) {
    const name = key.trim();
    if (!name || name === EVERGREEN_KEY) continue;
    const group = normalizeGroup(val);
    if (group.length) seasons[name] = group;
  }

  // Legacy migration: an old row carried a flat `seasonal` list and no `seasons`
  // map. Fold it under "Unfiled" (unless a real Unfiled season is already there).
  if (!("seasons" in r) && Array.isArray(r.seasonal)) {
    const legacy = normalizeGroup(r.seasonal);
    if (legacy.length && !seasons[UNFILED_SEASON]) seasons[UNFILED_SEASON] = legacy;
  }

  return { evergreen, seasons };
}

// The slots that actually hold colours — evergreen first, then seasons by name.
// This is the menu of palettes a board can be given, and what the manager lists.
export function filledSlots(lib: PaletteLibrary): PaletteSlot[] {
  const out: PaletteSlot[] = [];
  if (lib.evergreen.length)
    out.push({ key: EVERGREEN_KEY, label: "Evergreen", swatches: lib.evergreen });
  for (const name of Object.keys(lib.seasons).sort((a, b) => a.localeCompare(b))) {
    out.push({ key: name, label: name, swatches: lib.seasons[name] });
  }
  return out;
}

// Clean a board's stored palette-key list: strings, trimmed, de-duped, order kept.
export function normalizeBoardPalettes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const k = v.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

// The palettes a board should display: its keys resolved against the library, in
// the board's chosen order, skipping any that no longer exist or hold no colour.
export function resolveBoardPalettes(lib: PaletteLibrary, keys: string[]): PaletteSlot[] {
  const out: PaletteSlot[] = [];
  for (const key of keys) {
    if (key === EVERGREEN_KEY) {
      if (lib.evergreen.length) out.push({ key, label: "Evergreen", swatches: lib.evergreen });
    } else if (lib.seasons[key]?.length) {
      out.push({ key, label: key, swatches: lib.seasons[key] });
    }
  }
  return out;
}

// Apply palette renames to a board's key list (Tess, 2026-09-14: "easily change
// the palette name"). Boards store palettes by name, so when a palette is renamed
// its key must follow — otherwise a board that had "Spring / Summer 2027" would
// silently lose it. Every board is remapped through this on save, so a rename
// keeps the palette on whatever boards already showed it. Order is preserved and
// a rename that lands on a key the board already carries is de-duplicated.
export function remapBoardKeys(keys: string[], renames: { from: string; to: string }[]): string[] {
  const clean = normalizeBoardPalettes(keys);
  if (!renames.length) return clean;
  const map = new Map(renames.map((r) => [r.from, r.to]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of clean) {
    const nk = (map.get(k) ?? k).trim();
    if (!nk || seen.has(nk)) continue;
    seen.add(nk);
    out.push(nk);
  }
  return out;
}
