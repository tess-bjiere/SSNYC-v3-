import { cookies } from "next/headers";
import { brandOr, isBrandSlug } from "@/lib/brands";
import { loadBrandSlugs } from "@/lib/brandsServer";
import { getSessionUser } from "@/lib/access";

// Which brand the current request is scoped to (multi-brand).
//
// A server helper, not a pure lib module — it reaches for the request's cookies
// and the session. Every branded query reads the active brand through here, so
// the talent gate lives in one place: a talent is pinned to their own brand and
// the switcher cookie is ignored, and a talent with no brand set scopes to a
// slug no row carries — an empty view, never the default brand's data.

export const BRAND_COOKIE = "ssync_brand";

/** A slug nothing is filed under, so a mis-configured talent sees nothing. */
const NO_BRAND = "__none__";

export async function activeBrand(): Promise<string> {
  const user = await getSessionUser();
  // Validate against the live brand list so a brand added in god mode is a real
  // scope, not treated as a stale slug and dropped to the default.
  const slugs = await loadBrandSlugs();
  if (user?.role === "talent") {
    return isBrandSlug(user.brand, slugs) ? (user.brand as string) : NO_BRAND;
  }
  const store = await cookies();
  return brandOr(store.get(BRAND_COOKIE)?.value, slugs);
}
