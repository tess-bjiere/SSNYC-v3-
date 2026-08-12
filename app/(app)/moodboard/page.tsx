import { createClient } from "@/lib/supabase/server";
import { archiveBoard } from "@/app/actions/moodboards";
import { getSessionUser, DEV_BYPASS } from "@/lib/access";
import { checkSuperAdmin } from "@/lib/brandsServer";
import { activeBrand } from "@/lib/activeBrand";
import { refThumb, type Reference } from "@/lib/types";
import { styleCoverUrl } from "@/lib/styleCover";
import { toSections, itemKind, type MBItem, type MBImageItem, type MBTextItem, type Moodboard } from "@/lib/moodboard";
import { normalizePalette } from "@/lib/palette";
import AddRefs from "./AddRefs";
import NotesDrawer from "./NotesDrawer";
import Toolbar from "./Toolbar";
import Board from "./Board";
import ColorPalette from "./ColorPalette";

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
  // God mode edits and deletes any note (Tess, 2026-08-12: "god mode should be
  // able to edit / delete any notes"); preview/bypass counts too, for testing.
  const godMode = DEV_BYPASS || checkSuperAdmin(user?.email);

  const brand = await activeBrand();
  const { data: boardsData } = await supabase
    .from("moodboards")
    .select("*")
    .eq("brand", brand)
    .order("created_at", { ascending: true });
  const allBoards = (boardsData ?? []) as Moodboard[];

  // The brand's colour palette (Tess, 2026-08-12). select("*") so a project that
  // has not run the p9 migration yet reads no palette and shows an empty section,
  // rather than erroring on an unknown column.
  const { data: brandRow } = await supabase
    .from("brands")
    .select("*")
    .eq("slug", brand)
    .maybeSingle();
  const palette = normalizePalette((brandRow as { palette?: unknown } | null)?.palette);

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

  // Styles placed on this board (Tess, 2026-08-06: "You should be able to add
  // styles in development to moodboards"). Same shape as the reference lookup
  // above and the same rule: one query for the whole board, never one per tile.
  const styleTileIds = Array.from(
    new Set(imageItems.map((i) => (i.style_id ?? "").trim()).filter(Boolean))
  );
  let styleTileMap: Record<string, { id: string; name: string; src: string }> = {};
  if (styleTileIds.length) {
    const { data: rows } = await supabase
      .from("styles")
      .select("id,name,cover_image,photos,deleted_at")
      .in("id", styleTileIds);
    styleTileMap = Object.fromEntries(
      (rows ?? [])
        // A style in the trash stops being read, exactly as everywhere else —
        // the tile stays on the board, so restoring the style brings it back.
        .filter((r) => !r.deleted_at)
        .map((r) => [
          r.id as string,
          {
            id: r.id as string,
            name: (r.name as string) || "Untitled",
            src: styleCoverUrl(r) ?? "",
          },
        ])
    );
  }

  const { data: libData } = await supabase
    .from("references")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const library = (libData ?? []) as Reference[];

  // Everything that could be put on a board from the development side. Archived
  // styles are included on purpose — last season's coat is exactly the thing
  // you pin up beside this season's, and a board is a place to argue, not a
  // work queue.
  const { data: devData } = await supabase
    .from("styles")
    .select("id,name,season,status,cover_image,photos")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const devStyles = (devData ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) || "Untitled",
    season: (r.season as string) || "",
    status: (r.status as string) || "",
    src: styleCoverUrl(r) ?? "",
  }));

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Moodboard</h1>
        {showingArchived && <span className="badge archived">Archived view</span>}
      </div>

      <Toolbar
        boards={boardList.map((b) => ({ id: b.id, name: b.name }))}
        currentId={current?.id ?? ""}
        currentName={current?.name ?? ""}
        showingArchived={showingArchived}
        archivedCount={archivedBoards.length}
      />

      {/* Brand-level colour reference, shown whichever board is open (Tess,
          2026-08-12). Above the boards, out of the export capture below. */}
      <ColorPalette initial={palette} />

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
                    // A style tile shows the style's own cover and wears its
                    // name in the "in development" tag, which is both true and
                    // the shortcut to the profile. It has no reference behind
                    // it, so clicking the picture opens nothing — the tag is
                    // the way in.
                    const styleTile = img.style_id ? styleTileMap[img.style_id] : undefined;
                    if (styleTile) {
                      return {
                        iid: img.iid,
                        src: styleTile.src,
                        title: styleTile.name,
                        ref: null,
                        dev: [{ id: styleTile.id, name: styleTile.name }],
                      };
                    }
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
            styles={devStyles}
            sections={sections
              .filter((s) => s.tid)
              .map((s) => ({ tid: s.tid as string, label: s.label || "Untitled section" }))}
          />
          <NotesDrawer boardId={current.id} notes={notes} me={me} canEditAll={godMode} canDeleteAll={godMode} />

          {/* Archiving is a rare, end-of-life act, so it sits quietly at the
              foot of the page rather than in the toolbar (Tess, 2026-08-11:
              "archive button should be on bottom of page / way less prominent"). */}
          <div className="mb-archive-foot">
            <form action={archiveBoard.bind(null, current.id, !showingArchived)}>
              <button className="btn link" type="submit">
                {showingArchived ? "Unarchive this board" : "Archive this board"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
