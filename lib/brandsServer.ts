// The live brand list, read from the DB (multi-brand god mode, Tess 2026-08-11).
//
// lib/brands.ts stays pure and holds the seed + the helpers; this is the server
// side that reads the `brands` table. cache() memoises it per request so the
// many callers (layout, activeBrand on every page, the validating actions) share
// one query. If the table cannot be read it falls back to the seed brands, so
// the switcher and validation are never empty.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { type Brand } from "@/lib/brands";
import { APP } from "@/lib/appConfig";
import { isSuperAdmin, parseSuperAdmins } from "@/lib/superAdmins";

export const loadBrands = cache(async (): Promise<Brand[]> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("brands").select("slug,name,logo_url").order("created_at");
    if (data && data.length) return data as Brand[];
  } catch {
    // fall through to the app default
  }
  // App-specific fallback, so a deployment that can't read its brands table
  // shows its OWN brand, never another app's seed (Tess, 2026-08-17: "the fred
  // version shouldnt show the [switcher] for other brands"). The pure seed in
  // lib/brands.ts stays the Loyalist's; this is the per-deployment default.
  return [{ slug: APP.defaultBrand.slug, name: APP.defaultBrand.name }];
});

export async function loadBrandSlugs(): Promise<string[]> {
  return (await loadBrands()).map((b) => b.slug);
}

/** Whether an email is a super-admin, reading the env extras at the edge. */
export function checkSuperAdmin(email: string | null | undefined): boolean {
  return isSuperAdmin(email, parseSuperAdmins(process.env.SSYNC_SUPER_ADMINS));
}
