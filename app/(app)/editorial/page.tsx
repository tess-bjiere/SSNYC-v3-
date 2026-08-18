import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { type Reference } from "@/lib/types";
import { toSections, type MBItem, type Moodboard } from "@/lib/moodboard";
import { type ListsSetting } from "@/lib/lists";
import EditorialClient from "./EditorialClient";

export const dynamic = "force-dynamic";

export default async function EditorialPage() {
  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data }, { data: boardsData }, { data: settingsData }] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      // Editorial images share the references table with the library; `type` is
      // the only thing telling them apart. This is the mirror of the filter on
      // /library, so every live row shows up on exactly one of the two pages.
      .eq("type", "editorial")
      .order("created_at", { ascending: false }),
    // Boards, so a campaign image can be dropped straight onto a moodboard from
    // its thumbnail (Tess, 2026-08-17) — same shape the Library picker uses.
    supabase.from("moodboards").select("id,name,archived,items").eq("brand", brand).order("created_at", { ascending: true }),
    supabase.from("settings").select("key,value").in("key", ["lists", "designers"]),
  ]);

  const refs = (data ?? []) as Reference[];

  const boards = ((boardsData ?? []) as Moodboard[])
    .filter((b) => !b.archived)
    .map((b) => ({
      id: b.id,
      name: b.name,
      sections: toSections((b.items as MBItem[]) ?? [])
        .sections.filter((s) => s.tid)
        .map((s) => ({ tid: s.tid as string, label: s.label || "Untitled section" })),
    }));

  const rows = (settingsData ?? []) as { key: string; value: unknown }[];
  const lists = (rows.find((r) => r.key === "lists")?.value ?? {}) as ListsSetting;
  const designers = (rows.find((r) => r.key === "designers")?.value ?? []) as string[];

  return <EditorialClient refs={refs} boards={boards} lists={lists} designers={designers} />;
}
