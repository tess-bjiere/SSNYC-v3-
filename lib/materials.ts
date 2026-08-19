/**
 * The materials library — fabrics and trims (Tess, 2026-08-18: "build library
 * for fabrics and trims"). A sibling to the references library.
 *
 * One table, one `kind` telling fabric from trim. This module is the pure part:
 * the fields each kind shows, the one-line spec on a card, and free-text search
 * — all dependency-free and tested without a database (lib/materials.test.mts).
 */

export type MaterialKind = "fabric" | "trim";

/** The columns a card / form / search read — declared structurally so this stays
 *  dependency-free. */
export type MaterialLike = {
  kind?: string | null;
  name?: string | null;
  supplier?: string | null;
  supplier_ref?: string | null;
  composition?: string | null;
  color?: string | null;
  weight?: string | null;
  width?: string | null;
  construction?: string | null;
  finish?: string | null;
  trim_type?: string | null;
  size?: string | null;
  material?: string | null;
  price?: string | null;
  moq?: string | null;
  lead_time?: string | null;
  notes?: string | null;
  // Custom or stock (Tess, 2026-08-19: "add check for custom or stock"). Stock is
  // an off-the-shelf material; custom is developed/made-to-order. Unset until
  // someone says which.
  sourcing?: string | null;
  // The products (garments) this material is used for — FRED's website products,
  // which are the brand's styles (Tess, 2026-08-19: "add a dropdown for garments
  // the fabric is being used for … it would be the products listed on the
  // website … used for multiple"). A jsonb array of product names; one material
  // can serve many products.
  garments?: unknown;
};

export type Sourcing = "stock" | "custom";

export type MaterialField = { key: string; label: string };

// Fields common to both kinds.
export const SHARED_FIELDS: MaterialField[] = [
  { key: "supplier", label: "Supplier" },
  { key: "supplier_ref", label: "Supplier ref" },
  { key: "composition", label: "Composition" },
  { key: "color", label: "Colour" },
  { key: "price", label: "Price" },
  { key: "moq", label: "MOQ" },
  { key: "lead_time", label: "Lead time" },
];
// A fabric is specced by weight / width / how it's built and finished.
export const FABRIC_FIELDS: MaterialField[] = [
  { key: "weight", label: "Weight (GSM)" },
  { key: "width", label: "Width" },
  { key: "construction", label: "Construction" },
  { key: "finish", label: "Finish" },
];
// A trim by what it is, its size, and what it's made of.
export const TRIM_FIELDS: MaterialField[] = [
  { key: "trim_type", label: "Type" },
  { key: "size", label: "Size" },
  { key: "material", label: "Material" },
];

/** The fields a form/detail shows for a kind: the kind-specific ones first,
 *  then the shared set. `name` is handled separately (it is always required). */
export function fieldsFor(kind: MaterialKind): MaterialField[] {
  const specific = kind === "trim" ? TRIM_FIELDS : FABRIC_FIELDS;
  return [...specific, ...SHARED_FIELDS];
}

export function kindOf(m: MaterialLike): MaterialKind {
  return m.kind === "trim" ? "trim" : "fabric";
}
export function kindLabel(k: MaterialKind): string {
  return k === "trim" ? "Trim" : "Fabric";
}

/** Custom / stock, normalized — anything else (unset) reads as "". */
export function sourcingOf(m: MaterialLike): Sourcing | "" {
  return m.sourcing === "custom" || m.sourcing === "stock" ? m.sourcing : "";
}
export function sourcingLabel(s: Sourcing | ""): string {
  return s === "custom" ? "Custom" : s === "stock" ? "Stock" : "";
}

// The two ways a fabric is built. A fabric sort divides into these before it
// divides by content (Tess, 2026-08-19: "when you sort by fabric it should be by
// knit content types and woven content types"). Read off the free-text
// `construction` field by the words weavers and knitters actually use — the bare
// "Knit"/"Woven" first, then the common names of each.
const KNIT_WORDS =
  /\b(knit|jersey|rib|interlock|fleece|terry|piqu|waffle|ponte|loopback|mesh)\b/i;
const WOVEN_WORDS =
  /\b(woven|twill|poplin|oxford|canvas|denim|flannel|chambray|sateen|satin|dobby|herringbone|corduroy|cord|gabardine|broadcloth|seersucker|voile|shirting|drill)\b/i;

export type FabricClass = "Knit" | "Woven" | "Other";

/** Knit vs woven for a fabric, from its construction text; "Other" when it says
 *  nothing recognizable (or is blank). */
export function constructionClass(m: MaterialLike): FabricClass {
  const c = (m.construction ?? "").toLowerCase();
  if (KNIT_WORDS.test(c)) return "Knit";
  if (WOVEN_WORDS.test(c)) return "Woven";
  return "Other";
}

/** The one line under a card: what it is made of, what it costs, who it comes
 *  from (Tess, 2026-08-19: "Preview text should be / contents / cost / supplier
 *  / location"). Blanks are skipped, so a material with no price entered reads
 *  as contents and supplier rather than leaving a gap or a stray separator.
 *
 *  It used to carry GSM and width for a fabric, and type and size for a trim.
 *  Those are the numbers you compare once you are already looking at one
 *  material; the card is for finding it, and cost is what was missing.
 *  Everything dropped from here is still on the detail and still searchable —
 *  matchMaterial reads every field regardless of what this line shows.
 *
 *  "Contents" is composition on a fabric and material on a trim: the same
 *  question, asked of two different shapes of thing. Location is not a column —
 *  it is written into supplier, as in "Vilartex (Portugal)". */
export function specLine(m: MaterialLike): string {
  const contents = kindOf(m) === "trim" ? m.material : m.composition;
  return [contents, m.price, m.supplier]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** The products (garments) a material is used for, read from the jsonb array
 *  into clean, de-duplicated, non-empty strings — order preserved. Anything that
 *  is not an array of strings reads as none. */
export function materialGarments(m: MaterialLike): string[] {
  const a = m.garments;
  if (!Array.isArray(a)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of a) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** Does this material serve the given product? Case-insensitive exact match on
 *  a product name. */
export function usedForProduct(m: MaterialLike, product: string): boolean {
  const p = product.trim().toLowerCase();
  return materialGarments(m).some((g) => g.toLowerCase() === p);
}

/** A fabric weight shown as GSM on the card. A bare number gets " GSM" appended;
 *  a value that already names a unit (gsm / oz / g) is left as typed. */
export function gsmLabel(weight: string | null | undefined): string {
  const w = (weight ?? "").trim();
  if (!w) return "";
  return /[a-z]/i.test(w) ? w : `${w} GSM`;
}

/** Free-text search across every field that carries words, the products it is
 *  used for included. Every whitespace-separated term must appear somewhere
 *  (AND), so "linen 200" narrows. */
export function matchMaterial(m: MaterialLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    m.name, m.supplier, m.supplier_ref, m.composition, m.color, m.weight, m.width,
    m.construction, m.finish, m.trim_type, m.size, m.material, m.notes,
    sourcingOf(m),
    ...materialGarments(m),
  ]
    .map((s) => (s ?? "").toLowerCase())
    .join(" ");
  return q.split(/\s+/).every((t) => hay.includes(t));
}

/** Distinct, sorted, non-empty values of a field across a set — for the supplier
 *  filter dropdown. */
export function distinct(list: MaterialLike[], key: keyof MaterialLike): string[] {
  const s = new Set<string>();
  for (const m of list) {
    const v = ((m[key] as string | null | undefined) ?? "").trim();
    if (v) s.add(v);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}
