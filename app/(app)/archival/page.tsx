import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { type Reference } from "@/lib/types";
import { toSections, type MBItem, type Moodboard } from "@/lib/moodboard";
import { type ListsSetting } from "@/lib/lists";
import { MOCK } from "@/lib/mock";
import { ARCHIVAL_SEED } from "@/lib/seeds/archival";
import EditorialClient from "../editorial/EditorialClient";

export const dynamic = "force-dynamic";

// Archival — vintage reference images (Tess, 2026-11-02: "Update SYNC tool to
// have a section for vintage reference images. They could live in a section like
// campaign but call it 'archival'"). The Campaign page over rows of type
// 'archival': same table, same grid, same credits, its own wall. Kept out of the
// References library (which reads reference/null only) and out of Campaign
// (editorial only), and still pinnable to a moodboard, which reads every row.
export default async function ArchivalPage() {
  // The demo preview has no database; show the import's own rows so the page
  // can be looked at before it is deployed.
  if (MOCK) {
    const refs = ARCHIVAL_SEED.map((r, i) => ({
      id: `arch-${i}`,
      image: null,
      thumb: null,
      image_url: r.image,
      thumb_url: r.thumb ?? r.image,
      designer: r.designer,
      year: r.year,
      season: null,
      category: null,
      garment: null,
      fabric: null,
      color: null,
      color_hex: null,
      photographer: r.photographer,
      photographer_ig: null,
      model: r.model,
      location: r.location,
      link: null,
      price: null,
      notes: r.notes,
      type: "archival",
      extra_images: null,
      created_by: null,
      deleted_at: null,
      created_at: new Date(Date.UTC(2026, 10, 2) - i * 1000).toISOString(),
    })) as Reference[];
    return <EditorialClient variant="archival" refs={refs} boards={[]} lists={{} as ListsSetting} designers={[]} />;
  }

  const supabase = await createClient();
  const brand = await activeBrand();
  const [{ data }, { data: boardsData }, { data: settingsData }] = await Promise.all([
    supabase
      .from("references")
      .select("*")
      .eq("brand", brand)
      .is("deleted_at", null)
      .eq("type", "archival")
      .order("created_at", { ascending: false }),
    supabase.from("moodboards").select("id,name,archived,items").eq("brand", brand).order("created_at", { ascending: true }),
    supabase.from("settings").select("key,value").in("key", ["lists", "designers"]),
  ]);

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

  return (
    <EditorialClient
      variant="archival"
      refs={(data ?? []) as Reference[]}
      boards={boards}
      lists={lists}
      designers={designers}
    />
  );
}
