/**
 * FRED style numbers (Tess, 2026-08-23 spec; 2026-08-20 "i want fred to auto
 * generate style numbers based on our rules, the user would have the ability to
 * edit if needed").
 *
 * `FR-` + five digits: the first two are a family+category code, the last three a
 * sequence (001–999, assigned in order of creation, gaps never backfilled). The
 * first digit is a product family, the second a category inside it — ten families
 * of ten, with room to grow. No season or year in the number.
 *
 * Canonical reference: ~/fred-shopify/docs/style-numbering.md. This module is the
 * machine-readable half: the code table, the app-category → code map, and the
 * next-number logic. Dependency-free and unit-tested (lib/fredStyleNumber.test.mts).
 */

/** Every two-digit category code, with what it reads as. The whole `0x` decade is
 *  held open (footwear the likely claimant), so it is not listed. */
export const FRED_CODE_LABELS: Record<string, string> = {
  "10": "Underwear",
  "11": "Socks",
  "20": "T-shirts & jersey",
  "21": "Shirting",
  "22": "Knitwear",
  "23": "Sweatshirts & fleece",
  "30": "Denim",
  "31": "Trousers",
  "40": "Outerwear",
  "50": "Swimwear",
  "60": "Small leather goods",
  "61": "Bags",
  "62": "Belts",
  "63": "Hats",
  "64": "Jewelry",
  "70": "Eyewear",
  "80": "Fragrance",
  "90": "Homegoods",
};

/**
 * The app's `category` values → a default code. The app categories are broader
 * than the numbering's sub-splits (Tops covers tees/shirting/sweats; Bottoms
 * covers denim/trousers; Accessories covers five), so each broad category maps to
 * the family's ANCHOR code as a sensible default — the user edits down to a
 * sub-split when it matters, which is exactly the "edit if needed" the feature
 * asks for. Categories with no home in the allocation (Dresses, Activewear) map to
 * nothing and get no auto-number.
 */
export const FRED_CATEGORY_CODE: Record<string, string> = {
  Underwear: "10",
  Socks: "11",
  Tops: "20",
  Knitwear: "22",
  Bottoms: "30",
  Outerwear: "40",
  Swimwear: "50",
  Accessories: "60",
  Bags: "61",
};

/** The code a category defaults to, or null when the category has no allocation. */
export function fredCodeForCategory(category: string | null | undefined): string | null {
  if (!category) return null;
  return FRED_CATEGORY_CODE[category.trim()] ?? null;
}

const NUMBER_RE = /^FR-(\d{2})(\d{3})$/;

/** Whether a string is a well-formed FRED style number. */
export function isFredStyleNumber(value: string | null | undefined): boolean {
  return typeof value === "string" && NUMBER_RE.test(value.trim());
}

/**
 * The next sequence for a code: one past the highest sequence already used in it,
 * starting at 1. Gaps are never backfilled — a killed style keeps its number — so
 * this reads the MAX, not the count. Anything that is not an `FR-<code><nnn>` for
 * this exact code is ignored.
 */
export function fredNextSequence(existing: readonly string[], code: string): number {
  let max = 0;
  for (const raw of existing) {
    const m = NUMBER_RE.exec((raw ?? "").trim());
    if (m && m[1] === code) {
      const n = parseInt(m[2], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

/** `FR-` + code + three-digit sequence. */
export function formatFredNumber(code: string, sequence: number): string {
  return `FR-${code}${String(sequence).padStart(3, "0")}`;
}

/**
 * The number a new style in `category` should take, given the numbers already in
 * use — or null when the category has no code (so the field is simply left for the
 * user to fill). Returns null past 999 in a code rather than rolling into a
 * four-digit sequence: a full code is a real event that wants a person, not a
 * silently malformed number.
 */
export function suggestFredNumber(
  existing: readonly string[],
  category: string | null | undefined
): string | null {
  const code = fredCodeForCategory(category);
  if (!code) return null;
  const seq = fredNextSequence(existing, code);
  if (seq > 999) return null;
  return formatFredNumber(code, seq);
}
