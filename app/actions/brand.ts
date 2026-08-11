"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { brandOr } from "@/lib/brands";
import { loadBrandSlugs } from "@/lib/brandsServer";
import { BRAND_COOKIE } from "@/lib/activeBrand";
import { requireUser } from "@/lib/access";

// Switch the brand the app is scoped to (multi-brand phase 1, Tess 2026-08-11).
//
// Signed-in only, like every other write. Phase 2 will refuse this for a talent
// — they are pinned to one brand and have no switcher — but today anyone on the
// team may move between brands. brandOr means a forged slug can only ever land
// on a real brand, never scope the app to nothing.
export async function setActiveBrand(slug: string) {
  const user = await requireUser();
  // A talent is pinned to their brand and has no switcher; the endpoint still
  // exists, so it refuses them rather than trusting the UI to hide it.
  if (user.role !== "team") return;
  const slugs = await loadBrandSlugs();
  const store = await cookies();
  store.set(BRAND_COOKIE, brandOr(slug, slugs), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Everything reads the brand on the server, so the whole tree re-renders.
  revalidatePath("/", "layout");
}
