import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { type Reference } from "@/lib/types";
import { toSections, type MBItem, type Moodboard } from "@/lib/moodboard";
import { type ListsSetting } from "@/lib/lists";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createClient();
  const brand = await activeBrand(); // this brand's references and boards only
  const [{ data }, { data: boardsData }, { data: settingsData }] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      // The References library holds ONLY product/packaging references (Tess,
      // 2026-08-19: "references should be saved for product and packaging").
      // Campaign images (`type='editorial'`) and photographer roster images
      // (`type='roster'`) live in the same table but have their own homes —
      // /editorial and /photographers — so they are kept out of this grid.
      // Filtering to reference/null (rather than "not editorial") is what stops
      // the roster from leaking in here, which is also why a References cleanup
      // can no longer touch the photographer directory. Rows with no `type` at
      // all are legacy library references and still count.
      .or("type.is.null,type.eq.reference")
      .order("created_at", { ascending: false }),
    supabase.from("moodboards").select("id,name,archived,items").eq("brand", brand).order("created_at", { ascending: true }),
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
