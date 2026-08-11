// The brands SSYNC serves (multi-brand, Tess 2026-08-11).
//
// One app, several brands; a row's `brand` column holds one of these slugs. The
// list is DATA now — a super-admin adds one from Setup (Tess, 2026-08-11:
// "ability for admin / god mode to add new brand"), stored in the `brands`
// table and loaded by lib/brandsServer.ts. The two below are the seed, kept here
// as the fallback so this module stays pure and dependency-free (unit-testable,
// importable on the client) and so validation never scopes to nothing if the
// list cannot be read. The slug is the stored key and never changes; the name is
// what a person reads and can (rename is allowed, the slug is not).

export type Brand = { slug: string; name: string };

/** The seed brands — every row that existed before this feature belongs to one,
 *  and this is the fallback when the DB list has not been handed in. */
export const BRANDS: readonly Brand[] = [
  { slug: "sous-sous", name: "SOUS SOUS" },
  { slug: "renggli", name: "RENGGLI" },
] as const;

export const BRAND_SLUGS: readonly string[] = BRANDS.map((b) => b.slug);

/** The brand every existing row belongs to, and the fallback for a bad slug. */
export const DEFAULT_BRAND = "sous-sous";

/** True if `v` is one of `slugs` — pass the live list from the DB; defaults to
 *  the seed so callers that don't have the list still validate the seed brands. */
export function isBrandSlug(
  v: string | null | undefined,
  slugs: readonly string[] = BRAND_SLUGS
): boolean {
  return typeof v === "string" && slugs.includes(v);
}

/** A valid slug, or the default — so a stale cookie can never scope to nothing. */
export function brandOr(
  v: string | null | undefined,
  slugs: readonly string[] = BRAND_SLUGS
): string {
  return isBrandSlug(v, slugs) ? (v as string) : DEFAULT_BRAND;
}

/** The name a person reads for a slug; the slug itself if it is not a known
 *  brand. Pass the live list to name a brand added after build time. */
export function brandName(
  slug: string | null | undefined,
  brands: readonly Brand[] = BRANDS
): string {
  const s = (slug ?? "").trim();
  return brands.find((b) => b.slug === s)?.name ?? s;
}

/** name → slug: lowercase, spaces/punctuation to single hyphens, trimmed. What
 *  the god-mode add form derives a new brand's slug from. */
export function toBrandSlug(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
