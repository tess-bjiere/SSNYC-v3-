import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { type Reference } from "@/lib/types";
import PhotographersClient from "./PhotographersClient";

export const dynamic = "force-dynamic";

// The photographer directory (Tess, 2026-08-17). It is built entirely from the
// campaign images — same rows as /editorial, told apart by `type = editorial` —
// so it needs no data of its own; it just reads the credits already on them.
export default async function PhotographersPage() {
  const supabase = await createClient();
  const brand = await activeBrand();
  const { data } = await supabase
    .from("references")
    .select("*")
    .eq("brand", brand)
    .is("deleted_at", null)
    .eq("type", "editorial")
    .order("created_at", { ascending: false });

  return <PhotographersClient refs={(data ?? []) as Reference[]} />;
}
