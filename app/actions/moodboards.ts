"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEV_BYPASS, requireUser } from "@/lib/access";
import { checkSuperAdmin } from "@/lib/brandsServer";
import { activeBrand } from "@/lib/activeBrand";
import { REFERENCES_BUCKET } from "@/lib/storage";
import { applyReorder, insertItems, removeImage } from "@/lib/moodboard";
import type { MBItem, MBImageItem, MBTextItem, MBDividerItem } from "@/lib/moodboard";
import { normalizePalette, type Palette } from "@/lib/palette";

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

// Edit a note's text. The author may edit their own; god mode (a named
// super-admin, or preview/bypass) may edit anyone's (Tess, 2026-08-12: "god mode
// should be able to edit / delete any notes"). The check re-runs on the server —
// the client only decides which buttons to show.
export async function editNote(boardId: string, noteTid: string, text: string) {
  const t = (text || "").trim();
  if (!t) return;
  const supabase = await createClient();
  const user = await requireUser();
  const me = user?.name || user?.email || "";
  const godMode = DEV_BYPASS || checkSuperAdmin(user?.email);

  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];

  const next = items.map((it) => {
    const n = it as MBTextItem;
    if (n.kind === "text" && n.tid === noteTid) {
      if (!(godMode || (me && n.by === me))) return it; // not the author, not god mode
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

// Delete a note outright. God mode only (Tess, 2026-08-12: "god mode should be
// able to edit / delete any notes") — a named super-admin, or preview/bypass.
// Deleting the note takes its replies with it, which is the point: the thread is
// being removed, not pruned. Server-verified, like editNote.
export async function deleteNote(boardId: string, noteTid: string) {
  const supabase = await createClient();
  const user = await requireUser();
  if (!(DEV_BYPASS || checkSuperAdmin(user?.email))) return; // god mode only

  const { data: board } = await supabase
    .from("moodboards")
    .select("items")
    .eq("id", boardId)
    .maybeSingle();
  const items: MBItem[] = (board?.items as MBItem[]) ?? [];

  const next = items.filter((it) => !(it.kind === "text" && (it as MBTextItem).tid === noteTid));
  if (next.length === items.length) return; // nothing matched — leave the board alone

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

// The moodboard colour palette (Tess, 2026-08-12). Stored per brand on the brands
// row, so it is the same palette whichever board is open. requireUser, not
// requireTeam, to match every other moodboard edit — a talent works on their
// brand's boards, and the palette is part of that.
//
// The whole palette is saved at once: it is a handful of swatches, and sending
// the full set sidesteps any per-swatch ordering or merge question. It is cleaned
// through normalizePalette on the way in so nothing half-typed reaches the row.
export async function saveColorPalette(palette: Palette) {
  const supabase = await createClient();
  await requireUser();
  const brand = await activeBrand();
  const clean = normalizePalette(palette);
  await supabase.from("brands").update({ palette: clean }).eq("slug", brand);
  revalidatePath("/moodboard");
}

// Upload a pattern / print image for a palette swatch (Tess, 2026-08-12: "you can
// upload swatch for pattern if needed"). Returns the public URL; the client puts
// it on the swatch and persists it with the next saveColorPalette — the same
// two-step the brand-logo uploader uses. requireUser, matching every moodboard
// edit. Images only; the picker downscales before sending, so these stay small.
export async function uploadSwatchImage(form: FormData): Promise<string | null> {
  const supabase = await createClient();
  await requireUser();
  const brand = await activeBrand();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("image/")) return null;

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `palette-swatches/${brand}-${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(REFERENCES_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (error) return null;

  const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
  return pub?.publicUrl ?? null;
}
