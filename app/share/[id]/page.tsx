import { notFound } from "next/navigation";
import { createPublicReadClient } from "@/lib/supabase/public";
import { refThumb, type Reference } from "@/lib/types";
import { styleCoverUrl } from "@/lib/styleCover";
import { toSections, itemKind, type MBItem, type MBImageItem, type MBTextItem, type Moodboard } from "@/lib/moodboard";
import NotesDrawer from "@/app/(app)/moodboard/NotesDrawer";

export const dynamic = "force-dynamic";

// Public, read-only view of a board — no login required. Anyone with the link can view.
export default async function SharedBoard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Read-only, and every query below is scoped: the board id from the URL, then
  // only the reference ids that board actually holds. See lib/supabase/public.ts.
  const supabase = await createPublicReadClient();

  const { data } = await supabase.from("moodboards").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const board = data as Moodboard;

  const items: MBItem[] = (board.items as MBItem[]) ?? [];
  const imageItems = items.filter((i) => itemKind(i) === "image") as MBImageItem[];
  const notes = items.filter((i) => itemKind(i) === "text") as MBTextItem[];
  const { sections } = toSections(items);

  const refIds = Array.from(new Set(imageItems.map((i) => i.ref_id).filter(Boolean)));
  let refMap: Record<string, Reference> = {};
  if (refIds.length) {
    const { data: refs } = await supabase.from("references").select("*").in("id", refIds);
    refMap = Object.fromEntries((refs ?? []).map((r) => [r.id, r as Reference]));
  }

  // Styles pinned to the board show here too, as pictures and nothing else.
  // A shared board is seen by people outside the studio, so a style tile is its
  // cover photograph without its name, its season or its status — the board is
  // the argument, not the development log.
  const styleTileIds = Array.from(
    new Set(imageItems.map((i) => (i.style_id ?? "").trim()).filter(Boolean))
  );
  let styleSrc: Record<string, string> = {};
  if (styleTileIds.length) {
    const { data: rows } = await supabase
      .from("styles")
      .select("id,cover_image,photos,deleted_at")
      .in("id", styleTileIds);
    styleSrc = Object.fromEntries(
      (rows ?? [])
        .filter((r) => !r.deleted_at)
        .map((r) => [r.id as string, styleCoverUrl(r) ?? ""])
    );
  }

  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, borderBottom: "1px solid var(--line)", paddingBottom: 16, marginBottom: 24 }}>
        <span className="brand">SSYNC</span>
        <h1 className="display" style={{ fontSize: "var(--t-display)", margin: 0 }}>{board.name}</h1>
        <span className="count">Shared board · view only</span>
      </div>

      {notes.length > 0 && <NotesDrawer boardId={board.id} notes={notes} me="" canEditAll={false} readOnly />}

      {sections.map((s, si) => (
        <div className="mb-sec" key={s.tid || si}>
          <div className="mb-sec-head">{s.label || " "}</div>
          <div className="mb-row">
            {s.images.map((img) => {
              const ref = refMap[img.ref_id];
              const src = img.style_id ? styleSrc[img.style_id] || "" : ref ? refThumb(ref) : "";
              if (!src) return null;
              return (
                <div className="mb-tile" key={img.iid} style={{ cursor: "default" }}>
                  <img src={src} alt={ref?.designer || ""} loading="lazy" />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
