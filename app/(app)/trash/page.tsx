import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { type Reference, type Style } from "@/lib/types";
import { itemKind, type MBItem, type MBImageItem, type Moodboard } from "@/lib/moodboard";
import TrashClient from "./TrashClient";

export const dynamic = "force-dynamic";

// Deleting a reference in the Library only sets `deleted_at` — the row, its
// images and its moodboard placements all stay put. This page is the other half
// of that: it shows what is in the Trash and lets it be put back, or finally
// thrown away.
export default async function TrashPage() {
  // Trash spans references and styles; treated as product-side (team only) for
  // now rather than split — a talent has no Trash link and is redirected here.
  await requireTeam();
  const supabase = await createClient();
  const brand = await activeBrand(); // only this brand's trash
  const [{ data }, { data: styleData }, { data: boardsData }] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .eq("brand", brand)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    // Styles work the same way as of 2026-08-05 — deleting one writes a
    // timestamp and nothing else. Most recently thrown away first, because the
    // thing somebody comes here to undo is almost always the last thing they
    // did.
    supabase
      .from("styles")
      .select("*")
      .eq("brand", brand)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    supabase.from("moodboards").select("id,name,archived,items").eq("brand", brand),
  ]);

  const refs = (data ?? []) as Reference[];
  const styles = (styleData ?? []) as Style[];

  // A trashed reference can still be placed on boards. Those tiles simply stop
  // rendering while it sits in the Trash and come back on restore — but a purge
  // would take them away for good, so the count is worth showing before anyone
  // clicks the irreversible button.
  const boardNames: Record<string, string[]> = {};
  for (const b of (boardsData ?? []) as Moodboard[]) {
    const items = ((b.items as MBItem[]) ?? []).filter((i) => itemKind(i) === "image");
    const ids = new Set((items as MBImageItem[]).map((i) => i.ref_id));
    for (const r of refs) {
      if (ids.has(r.id)) (boardNames[r.id] ||= []).push(b.name + (b.archived ? " (archived)" : ""));
    }
  }

  return <TrashClient refs={refs} styles={styles} boardNames={boardNames} />;
}
