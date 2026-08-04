import { createClient } from "@/lib/supabase/server";
import { type Reference } from "@/lib/types";
import { type ListsSetting } from "@/lib/lists";
import EditorialClient from "./EditorialClient";

export const dynamic = "force-dynamic";

export default async function EditorialPage() {
  const supabase = await createClient();
  const [{ data }, { data: settingsData }] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .is("deleted_at", null)
      // Editorial images share the references table with the library; `type` is
      // the only thing telling them apart. This is the mirror of the filter on
      // /library, so every live row shows up on exactly one of the two pages.
      .eq("type", "editorial")
      .order("created_at", { ascending: false }),
    supabase.from("settings").select("key,value").in("key", ["lists", "designers"]),
  ]);

  const refs = (data ?? []) as Reference[];

  const rows = (settingsData ?? []) as { key: string; value: unknown }[];
  const lists = (rows.find((r) => r.key === "lists")?.value ?? {}) as ListsSetting;
  const designers = (rows.find((r) => r.key === "designers")?.value ?? []) as string[];

  return <EditorialClient refs={refs} lists={lists} designers={designers} />;
}
