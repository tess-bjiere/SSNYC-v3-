import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { getSessionUser } from "@/lib/access";
import { APP } from "@/lib/appConfig";
import { type Reference } from "@/lib/types";
import { PHOTOGRAPHER_META_KEY } from "@/lib/photographerMeta";
import PhotographersClient from "./PhotographersClient";

export const dynamic = "force-dynamic";

// The photographer directory (Tess, 2026-08-17). Built from the campaign images —
// same rows as /editorial, told apart by `type = editorial` — plus a settings
// blob holding the team-entered side of each person (tier, video/directs,
// clients). No photographer table.
export default async function PhotographersPage() {
  // FRED-only for now (Tess, 2026-08-18: "hide ... photographer library on the
  // sous sous / renggli versions"). The nav hides the link on the SSYNC deploy;
  // this makes the URL itself a 404 there, so a shared/bookmarked link can't
  // reach it either.
  if (APP.id !== "fred") notFound();
  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data }, { data: metaRow }, user] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      // Both the campaign images (type 'editorial') and the prospect roster
      // (type 'roster') build the directory; Campaign shows only 'editorial', so
      // the roster stays out of it.
      .in("type", ["editorial", "roster"])
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
