/**
 * FRED style numbers and product taxonomy (Tess, 2026-08-23 spec; 2026-08-20 "i
 * want fred to auto generate style numbers", then "let's do garment level
 * refinement … edit the category and refinement lists to better reflect our
 * product categories / offering").
 *
 * `FR-` + five digits: the first two are a family+category code, the last three a
 * sequence (001–999, in order of creation, gaps never backfilled). First digit =
 * product family, second = category inside it. No season or year in the number.
 *
 * The taxonomy below IS the mapping. Each top-level Category is a family (first
 * digit); each Type under it is a specific category (the full two-digit code). The
 * style number is generated from the chosen Type, so a Tops style filed as
 * "Shirting" numbers into 21, not the family anchor 20. "Type" replaces the old
 * "Garment" field because not every family has garments — Home has textiles and
 * objects, Body has fragrance.
 *
 * Canonical reference: ~/fred-shopify/docs/style-numbering.md. The codes at the
 * `x0`/`x1`… anchors are frozen there; the higher sub-codes in each family sit in
 * ranges the doc holds open, are proposals until the first number is assigned in
 * them, and are edited HERE in one place. Dependency-free, unit-tested.
 */

export type FredType = { label: string; code: string };
export type FredCategory = { category: string; types: FredType[] };

/**
 * The FRED product taxonomy. Order is display order. The first Type in a family is
 * its anchor — the code used when a category is chosen but no Type is (yet).
 *
 * Frozen anchors from the canonical doc: 10, 11, 20, 21, 22, 23, 30, 31, 40, 50,
 * 60, 61, 62, 63, 64, 70, 80, 90. Everything else sits in a held-open range and is
 * a proposal until first used.
 */
export const FRED_TAXONOMY: FredCategory[] = [
  {
    category: "Innerwear",
    types: [
      { label: "Underwear", code: "10" },
      { label: "Socks", code: "11" },
      { label: "Loungewear", code: "12" },
      { label: "Sleepwear", code: "13" },
    ],
  },
  {
    category: "Tops",
    types: [
      { label: "T-shirts & jersey", code: "20" },
      { label: "Shirting", code: "21" },
      { label: "Knitwear", code: "22" },
      { label: "Sweatshirts & fleece", code: "23" },
      { label: "Polos", code: "24" },
      { label: "Tanks", code: "25" },
    ],
  },
  {
    category: "Bottoms",
    types: [
      { label: "Denim", code: "30" },
      { label: "Trousers", code: "31" },
      { label: "Shorts", code: "32" },
      { label: "Sweatpants", code: "33" },
    ],
  },
  {
    category: "Outerwear",
    types: [
      { label: "Outerwear", code: "40" },
      { label: "Coats", code: "41" },
      { label: "Jackets", code: "42" },
      { label: "Vests", code: "43" },
    ],
  },
  {
    category: "Swim",
    types: [
      { label: "Swimwear", code: "50" },
      { label: "Beach & resort", code: "51" },
    ],
  },
  {
    category: "Accessories",
    types: [
      { label: "Small leather goods", code: "60" },
      { label: "Bags", code: "61" },
      { label: "Belts", code: "62" },
      { label: "Hats", code: "63" },
      { label: "Jewelry", code: "64" },
      { label: "Scarves", code: "65" },
      { label: "Gloves", code: "66" },
    ],
  },
  {
    category: "Eyewear",
    types: [
      { label: "Eyewear", code: "70" },
      { label: "Optical", code: "71" },
      { label: "Sunglasses", code: "72" },
    ],
  },
  {
    category: "Body",
    types: [
      { label: "Fragrance", code: "80" },
      { label: "Grooming", code: "81" },
      { label: "Bath & body", code: "82" },
    ],
  },
  {
    category: "Home",
    types: [
      { label: "Homegoods", code: "90" },
      { label: "Textiles", code: "91" },
      { label: "Tabletop", code: "92" },
      { label: "Objects", code: "93" },
    ],
  },
];

/** The category names, in display order — the FRED category picklist. */
export const FRED_CATEGORIES: string[] = FRED_TAXONOMY.map((c) => c.category);

/** Every code → what it reads as, derived from the taxonomy. */
export const FRED_CODE_LABELS: Record<string, string> = Object.fromEntries(
  FRED_TAXONOMY.flatMap((c) => c.types.map((t) => [t.code, t.label])),
);

/** The Types offered under a category (its refinement list), or [] if unknown. */
export function fredTypesFor(category: string | null | undefined): FredType[] {
  const cat = FRED_TAXONOMY.find((c) => c.category === (category ?? "").trim());
  return cat ? cat.types : [];
}

/**
 * The two-digit code for a (category, type). The Type wins; with no Type it falls
 * back to the family anchor (the first Type's code). Null when the category is not
 * in the taxonomy (so nothing is auto-numbered and the user just types one).
 */
export function fredCodeFor(
  category: string | null | undefined,
  type?: string | null,
): string | null {
  const cat = FRED_TAXONOMY.find((c) => c.category === (category ?? "").trim());
  if (!cat) return null;
  const t = type ? cat.types.find((x) => x.label === type.trim()) : undefined;
  return t ? t.code : (cat.types[0]?.code ?? null);
}

/** The family-anchor code for a category (no Type). Kept for callers that only
 *  know the category. */
export function fredCodeForCategory(category: string | null | undefined): string | null {
  return fredCodeFor(category);
}

const NUMBER_RE = /^FR-(\d{2})(\d{3})$/;

/** Whether a string is a well-formed FRED style number. */
export function isFredStyleNumber(value: string | null | undefined): boolean {
  return typeof value === "string" && NUMBER_RE.test(value.trim());
}

/**
 * The next sequence for a code: one past the highest already used in it, from 1.
 * Reads the MAX, not the count — gaps are never backfilled — and ignores anything
 * that is not `FR-<code><nnn>` for this exact code.
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
 * The number a new style should take, given the numbers already in use, its
 * category and (optionally) its Type — or null when the category has no code, or
 * the code is full (999), which wants a person rather than a malformed number.
 */
export function suggestFredNumber(
  existing: readonly string[],
  category: string | null | undefined,
  type?: string | null,
): string | null {
  const code = fredCodeFor(category, type);
  if (!code) return null;
  const seq = fredNextSequence(existing, code);
  if (seq > 999) return null;
  return formatFredNumber(code, seq);
}
