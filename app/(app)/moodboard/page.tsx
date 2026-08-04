import { createClient } from "@/lib/supabase/server";
import { getSessionUser, DEV_BYPASS } from "@/lib/access";
import { refThumb, type Reference } from "@/lib/types";
import { toSections, itemKind, type MBItem, type MBImageItem, type MBTextItem, type Moodboard } from "@/lib/moodboard";
import AddRefs from "./AddRefs";
import NotesDrawer from "./NotesDrawer";
import Toolbar from "./Toolbar";
import Board from "./Board";

export const dynamic = "force-dynamic";

export default async function MoodboardPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; archived?: string }>;
}) {
  const { board: boardParam, archived } = await searchParams;
  const supabase = await createClient();
  const user = await getSessionUser();
  const me = user?.name || user?.email || "";

  const { data: boardsData } = await supabase
    .from("moodboards")
    .select("*")
    .order("created_at", { ascending: true });
  const allBoards = (boardsData ?? []) as Moodboard[];

  const activeBoards = allBoards.filter((b) => !b.archived);
  const archivedBoards = allBoards.filter((b) => b.archived);
  const showingArchived = archived === "1";
  const boardList = showingArchived ? archivedBoards : activeBoards;

  const current = boardList.find((b) => b.id === boardParam) ?? boardList[0] ?? null;

  const items: MBItem[] = current ? ((current.items as MBItem[]) ?? []) : [];
  const imageItems = items.filter((i) => itemKind(i) === "image") as MBImageItem[];
  const notes = items.filter((i) => itemKind(i) === "text") as MBTextItem[];
  const { sections } = toSections(items);
  const shownImageCount = sections.reduce((n, s) => n + s.images.length, 0);

  const refIds = Array.from(new Set(imageItems.map((i) => i.ref_id).filter(Boolean)));
  let refMap: Record<string, Reference> = {};
  // Which of the images on this board have already become styles. Read here, in
  // one pair of queries for the whole board, rather than per tile — a board can
  // hold a hundred images and this must not become a hundred round trips.
  let devMap: Record<string, { id: string; name: string }[]> = {};
  if (refIds.length) {
    const { data: refs } = await supabase.from("references").select("*").in("id", refIds);
    refMap = Object.fromEntries((refs ?? []).map((r) => [r.id, r as Reference]));

    const { data: links } = await supabase
      .from("style_references")
      .select("style_id,reference_id")
      .in("reference_id", refIds);
    const styleIds = Array.from(new Set((links ?? []).map((l) => l.style_id as string)));
    if (styleIds.length) {
      const { data: styleRows } = await supabase.from("styles").select("id,name").in("id", styleIds);
      const nameById = new Map((styleRows ?? []).map((s) => [s.id as string, (s.name as string) || "Untitled"]));
      const acc: Record<string, { id: string; name: string }[]> = {};
      for (const l of links ?? []) {
        const name = nameById.get(l.style_id as string);
        // A link whose style has since been deleted simply doesn't render; the
        // cascade normally removes it, so this is belt and braces.
        if (!name) continue;
        (acc[l.reference_id as string] ??= []).push({ id: l.style_id as string, name });
      }
      devMap = acc;
    }
  }

  const { data: libData } = await supabase
    .from("references")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const library = (libData ?? []) as Reference[];

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title serif">Moodboard</h1>
        {current && <span className="count">{shownImageCount} images</span>}
        {showingArchived && <span className="badge archived">Archived view</span>}
      </div>

      <Toolbar
        boards={boardList.map((b) => ({ id: b.id, name: b.name }))}
        currentId={current?.id ?? ""}
        currentName={current?.name ?? ""}
        showingArchived={showingArchived}
        archivedCount={archivedBoards.length}
      />

      {!current ? (
        <div className="empty">
          {showingArchived ? "No archived boards." : "No boards yet. Create one from the toolbar."}
        </div>
      ) : (
        <>
          {shownImageCount === 0 && sections.length === 0 ? (
            <div className="empty">This board has no images yet. Add references from your Library below.</div>
          ) : (
            <div id="mb-capture">
            <Board
              boardId={current.id}
              sections={sections.map((s) => ({
                tid: s.tid,
                label: s.label,
                images: s.images
                  .map((img) => {
                    const ref = refMap[img.ref_id];
                    return {
                      iid: img.iid,
                      src: ref ? refThumb(ref) : "",
                      title: [ref?.designer, ref?.garment, ref?.color].filter(Boolean).join(" · "),
                      ref: ref ?? null,
                      dev: devMap[img.ref_id] ?? [],
                    };
                  })
                  .filter((t) => t.src),
              }))}
            />
            </div>
          )}

          <AddRefs
            boardId={current.id}
            library={library}
            sections={sections
              .filter((s) => s.tid)
              .map((s) => ({ tid: s.tid as string, label: s.label || "Untitled section" }))}
          />
          <NotesDrawer boardId={current.id} notes={notes} me={me} canEditAll={DEV_BYPASS} />
        </>
      )}
    </div>
  );
}
