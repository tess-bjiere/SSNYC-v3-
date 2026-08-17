import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import { type Reference } from "@/lib/types";
import { PHOTOGRAPHER_META_KEY } from "@/lib/photographerMeta";
import PhotographersClient from "./PhotographersClient";

export const dynamic = "force-dynamic";

// The photographer directory (Tess, 2026-08-17). Built from the campaign images —
// same rows as /editorial, told apart by `type = editorial` — plus a settings
// blob holding the team-entered side of each person (tier, video/directs,
// clients). No photographer table.
export default async function PhotographersPage() {
  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data }, { data: metaRow }, user] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      .eq("type", "editorial")
      .order("created_at", { ascending: false }),
    supabase.from("settings").select("value").eq("key", PHOTOGRAPHER_META_KEY).maybeSingle(),
    getSessionUser(),
  ]);

  return (
    <PhotographersClient
      refs={(data ?? []) as Reference[]}
      metaValue={metaRow?.value ?? {}}
      canEdit={user?.role === "team"}
    />
  );
}
