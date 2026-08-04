import { createClient } from "@/lib/supabase/server";
import { type Reference } from "@/lib/types";
import { toSections, type MBItem, type Moodboard } from "@/lib/moodboard";
import { type ListsSetting } from "@/lib/lists";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const [{ data }, { data: boardsData }, { data: settingsData }] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .is("deleted_at", null)
      // Editorial images live in the same table, told apart by `type`. They have
      // their own view (/editorial) with their own filters, so they are kept out
      // of the Library grid — matching the original tool, where the two are
      // separate tabs. Rows with no `type` at all are treated as library
      // references so nothing written before the column existed disappears.
      .or("type.is.null,type.neq.editorial")
      .order("created_at", { ascending: false }),
    supabase.from("moodboards").select("id,name,archived,items").order("created_at", { ascending: true }),
    supabase.from("settings").select("key,value").in("key", ["lists", "designers"]),
  ]);

  const refs = (data ?? []) as Reference[];

  // Each board carries its section list so the add-to-board picker can drop a
  // reference straight into a named section instead of the end of the board.
  const boards = ((boardsData ?? []) as Moodboard[])
    .filter((b) => !b.archived)
    .map((b) => ({
      id: b.id,
      name: b.name,
      sections: toSections((b.items as MBItem[]) ?? [])
        .sections.filter((s) => s.tid)
        .map((s) => ({ tid: s.tid as string, label: s.label || "Untitled section" })),
    }));

  // The dropdown vocabulary Tess curated in the original tool. See lib/lists.ts —
  // `lists` is a diff against a base vocabulary, not a finished list.
  const rows = (settingsData ?? []) as { key: string; value: unknown }[];
  const lists = (rows.find((r) => r.key === "lists")?.value ?? {}) as ListsSetting;
  const designers = (rows.find((r) => r.key === "designers")?.value ?? []) as string[];

  return <LibraryClient refs={refs} boards={boards} lists={lists} designers={designers} />;
}
