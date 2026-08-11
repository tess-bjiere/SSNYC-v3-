// The brands SSYNC serves (multi-brand phase 1, Tess 2026-08-11).
//
// One app, several brands; a row's `brand` column holds one of these slugs. The
// list is fixed in code — a brand is a deliberate act of setting one up, not a
// value somebody types — the same way STYLE_STATUSES and the photo slots are
// fixed. Adding a brand is one entry here plus its seed data.
//
// Dependency-free so it can be unit-tested and imported anywhere, server or
// client. The slug is the stored key and never changes; the name is what a
// person reads and can.

export type Brand = { slug: string; name: string };

export const BRANDS: readonly Brand[] = [
  { slug: "sous-sous", name: "SOUS SOUS" },
  { slug: "renggli", name: "RENGGLI" },
] as const;

export const BRAND_SLUGS: readonly string[] = BRANDS.map((b) => b.slug);

/** The brand every existing row belongs to, and the fallback for a bad slug. */
export const DEFAULT_BRAND = "sous-sous";

export function isBrandSlug(v: string | null | undefined): boolean {
  return typeof v === "string" && BRAND_SLUGS.includes(v);
}

/** A valid slug, or the default — so a stale cookie can never scope to nothing. */
export function brandOr(v: string | null | undefined): string {
  return isBrandSlug(v) ? (v as string) : DEFAULT_BRAND;
}

/** The name a person reads for a slug; the slug itself if it is not a known brand. */
export function brandName(slug: string | null | undefined): string {
  const s = (slug ?? "").trim();
  return BRANDS.find((b) => b.slug === s)?.name ?? s;
}
