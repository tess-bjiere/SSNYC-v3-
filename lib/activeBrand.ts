import { cookies } from "next/headers";
import { brandOr } from "@/lib/brands";

// Which brand the current request is scoped to (multi-brand phase 1).
//
// A server helper, not a pure lib module — it reaches for the request's cookies.
// For now the brand is whatever the switcher last set; phase 2 will pin a talent
// to their own brand here and ignore the cookie, so every caller that reads the
// active brand through this function inherits that gate for free.

export const BRAND_COOKIE = "ssync_brand";

export async function activeBrand(): Promise<string> {
  const store = await cookies();
  return brandOr(store.get(BRAND_COOKIE)?.value);
}
