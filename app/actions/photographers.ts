"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import {
  PHOTOGRAPHER_META_KEY,
  withPhotographerMeta,
  type PhotographerMeta,
} from "@/lib/photographerMeta";

// Set the team-entered side of a photographer — tier, video/directs, clients
// (Tess, 2026-08-17). Stored in the shared `settings` jsonb under one key, keyed
// by the photographer's normalised name, read-modify-write so one edit never
// disturbs another person's card. No table, no migration.
export async function setPhotographerMeta(nameKey: string, patch: Partial<PhotographerMeta>) {
  await requireTeam();
  const key = (nameKey ?? "").trim();
  if (!key) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PHOTOGRAPHER_META_KEY)
    .maybeSingle();

  const next = withPhotographerMeta(data?.value ?? {}, key, patch);
  await supabase
    .from("settings")
    .upsert({ key: PHOTOGRAPHER_META_KEY, value: next, updated_at: new Date().toISOString() });

  revalidatePath("/photographers");
}
