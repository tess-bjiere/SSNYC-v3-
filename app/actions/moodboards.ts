"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEV_BYPASS, requireUser } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { applyReorder, insertItems, removeImage } from "@/lib/moodboard";
import type { MBItem, MBImageItem, MBTextItem, MBDividerItem } from "@/lib/moodboard";

export async function createBoard(form: FormData) {
  const name = (form.get("name") as string)?.trim();
  if (!name) return;
  const supabase = await createClient();
  const user = await requireUser();
  // Born into the brand you are looking at (multi-brand phase 1).
  const brand = await activeBrand();
  const { data } = await supabase
    .from("moodboards")
    .insert({ name, items: [], brand, created_by: user?.email ?? null })
    .select("id")
    .single();
  revalidatePath("/moodboard");
  if (data?.id) redirect(`/moodboard?board=${data.id}`);
}

// Add a new top-level note to a board, attributed to the current user.
export async function addNote(boardId: string, form: FormData) {
  const text = (form.get("text") as string)?.trim();
  if (!text) return;
  const supabase = await createClient();
  const user = await requireUser();

  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const maxZ = items.reduce((m, i) => Math.max(m, i.z ?? 0), 0);

  const note: MBTextItem = {
    kind: "text",
    tid: crypto.randomUUID(),
    text,
    x: 60,
    y: 60,
    z: maxZ + 1,
    w: 240,
    by: user?.name || user?.email || "Someone",
    ts: Date.now(),
    listOnly: true,
    replies: [],
  };

  await supabase
    .from("moodboards")
    .update({ items: [...items, note], updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Add a reply to an existing note, turning it into a thread.
export async function addReply(boardId: string, noteTid: string, form: FormData) {
  const text = (form.get("text") as string)?.trim();
  if (!text) return;
  const supabase = await createClient();
  const user = await requireUser();

  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];

  const next = items.map((it) => {
    const t = it as MBTextItem;
    if (t.kind === "text" && t.tid === noteTid) {
      const replies = Array.isArray(t.replies) ? t.replies : [];
      return {
        ...t,
        replies: [
          ...replies,
          {
            id: crypto.randomUUID(),
            by: user?.name || user?.email || "Someone",
            ts: Date.now(),
            text,
          },
        ],
      };
    }
    return it;
  });

  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Edit a note's text — only the author may edit (or anyone in preview/bypass mode).
export async function editNote(boardId: string, noteTid: string, text: string) {
  const t = (text || "").trim();
  if (!t) return;
  const supabase = await createClient();
  const user = await requireUser();
  const me = user?.name || user?.email || "";

  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];

  const next = items.map((it) => {
    const n = it as MBTextItem;
    if (n.kind === "text" && n.tid === noteTid) {
      if (!(DEV_BYPASS || (me && n.by === me))) return it; // not the author
      return { ...n, text: t };
    }
    return it;
  });

  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

export async function renameBoard(boardId: string, form: FormData) {
  await requireUser();
  const name = (form.get("name") as string)?.trim();
  if (!name) return;
  const supabase = await createClient();
  await supabase
    .from("moodboards")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Persist a new image/section order — see `applyReorder` in lib/moodboard.ts for
// the ordering rules.
export async function reorderImages(boardId: string, orderedIds: string[]) {
  await requireUser();
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const next = applyReorder(items, orderedIds);

  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Take one image off a board. This only removes the tile — the reference itself
// stays in the library, and any other placement of it on this board stays too.
// See `removeImage` in lib/moodboard.ts.
export async function removeImageFromBoard(boardId: string, iid: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const next = removeImage(items, iid);
  if (next.length === items.length) return; // nothing matched — leave the board alone
  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
  revalidatePath("/library");
}

export async function archiveBoard(boardId: string, archived: boolean) {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from("moodboards")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Add a new section divider at the end of the board.
export async function addDivider(boardId: string, form: FormData) {
  await requireUser();
  const text = (form.get("text") as string)?.trim() || "New section";
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const maxGi = items.reduce((m, i) => Math.max(m, typeof i.gi === "number" ? i.gi : 0), 0);
  const maxZ = items.reduce((m, i) => Math.max(m, i.z ?? 0), 0);

  const divider: MBDividerItem = {
    kind: "divider",
    tid: crypto.randomUUID(),
    text,
    x: 60,
    y: 60,
    z: maxZ + 1,
    w: 520,
    gi: maxGi + 1,
  };

  await supabase
    .from("moodboards")
    .update({ items: [...items, divider], updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Delete a section divider (its images merge into the section above it).
export async function deleteDivider(boardId: string, tid: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const next = items.filter(
    (it) => !((it as MBDividerItem).kind === "divider" && (it as MBDividerItem).tid === tid)
  );
  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Rename an existing section divider.
export async function editDivider(boardId: string, tid: string, text: string) {
  await requireUser();
  const t = (text || "").trim();
  if (!t) return;
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const next = items.map((it) => {
    const d = it as MBDividerItem;
    if (d.kind === "divider" && d.tid === tid) return { ...d, text: t };
    return it;
  });
  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  revalidatePath("/moodboard");
}

// Append reference images to a board (click-to-add from the Library).
//
// `sectionTid` is the divider id of the section to drop them into; the images land
// at the end of that section. With no target they go to the end of the board as an
// unsectioned trailing group, which is how adds behaved before section targeting.
export async function addRefsToBoard(boardId: string, refIds: string[], sectionTid?: string | null) {
  await requireUser();
  if (!refIds.length) return;
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();

  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const maxY = items.reduce((m, i) => Math.max(m, i.y ?? 0), 0);
  const maxZ = items.reduce((m, i) => Math.max(m, i.z ?? 0), 0);

  let y = maxY + 220;
  let x = 60;
  let z = maxZ + 1;
  const additions: MBImageItem[] = refIds.map((ref_id, idx) => {
    const item: MBImageItem = { iid: crypto.randomUUID(), ref_id, x, y, z: z++, w: 180 };
    x += 200;
    if ((idx + 1) % 5 === 0) {
      x = 60;
      y += 260;
    }
    return item;
  });

  const next = insertItems(items, additions, sectionTid);

  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);

  revalidatePath("/moodboard");
  revalidatePath("/library");
}


/**
 * Put styles in development onto a board.
 *
 * Tess, 2026-08-06: "You should be able to add styles in development to
 * moodboards."
 *
 * A board is where a season is argued out, and half of what belongs in that
 * argument is already being made — you cannot judge a new reference against a
 * collection whose own styles are not on the wall beside it. Until now a board
 * could only hold references, so the only way to show a style was to find a
 * photograph of it and re-upload it as a reference, which produced a second
 * copy of the same garment that then aged separately.
 *
 * A style tile carries `style_id` and an empty `ref_id`; nothing else about the
 * board changes, and the picture is read live from the style's cover, so a
 * style that gets better photographs next week gets them here too. Exactly like
 * addRefsToBoard, this writes an id onto a board and touches no style at all:
 * removing the tile removes the tile.
 */
export async function addStylesToBoard(
  boardId: string,
  styleIds: string[],
  sectionTid?: string | null
) {
  await requireUser();
  if (!styleIds.length) return;
  const supabase = await createClient();
  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();

  const items: MBItem[] = (board?.items as MBItem[]) ?? [];
  const maxY = items.reduce((m, i) => Math.max(m, i.y ?? 0), 0);
  const maxZ = items.reduce((m, i) => Math.max(m, i.z ?? 0), 0);

  let y = maxY + 220;
  let x = 60;
  let z = maxZ + 1;
  const additions: MBImageItem[] = styleIds.map((style_id, idx) => {
    const item: MBImageItem = {
      iid: crypto.randomUUID(),
      ref_id: "",
      style_id,
      x,
      y,
      z: z++,
      w: 180,
    };
    x += 200;
    if ((idx + 1) % 5 === 0) {
      x = 60;
      y += 260;
    }
    return item;
  });

  const next = insertItems(items, additions, sectionTid);

  await supabase
    .from("moodboards")
    .update({ items: next, updated_at: new Date().toISOString() })
    .eq("id", boardId);

  revalidatePath("/moodboard");
}
