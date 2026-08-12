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

export type Swatch = { hex: string; name: string };
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
  if (!hex && !name) return null;
  return { hex, name };
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

/** Read whatever is in the brand row into a well-formed palette. */
export function normalizePalette(raw: unknown): Palette {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    seasonal: normalizeGroup(r.seasonal),
    evergreen: normalizeGroup(r.evergreen),
  };
}
