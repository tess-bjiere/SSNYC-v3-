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
};

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

/** Free-text search across every field that carries words. Every whitespace-
 *  separated term must appear somewhere (AND), so "linen 200" narrows. */
export function matchMaterial(m: MaterialLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    m.name, m.supplier, m.supplier_ref, m.composition, m.color, m.weight, m.width,
    m.construction, m.finish, m.trim_type, m.size, m.material, m.notes,
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
