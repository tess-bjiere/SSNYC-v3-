"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEV_BYPASS, requireUser } from "@/lib/access";
import { checkSuperAdmin } from "@/lib/brandsServer";
import { activeBrand } from "@/lib/activeBrand";
import {
  addItems,
  removeItem,
  reorderItems,
  setItemField,
  setItemColors,
  normalizeItems,
  normalizeKind,
  type LinesheetItem,
  type LinesheetColorName,
} from "@/lib/linesheet";
import {
  addNote,
  addReplyTo,
  setNoteText,
  removeNote,
  normalizeNotes,
  findNote,
  type Note,
} from "@/lib/notes";

// Every write to a linesheet goes through here, matching app/actions/moodboards.ts:
// requireUser (a linesheet is the product team's, but the same signed-in gate as a
// board), read the row's items jsonb, apply a pure lib/linesheet.ts helper, write
// the whole list back. Nothing hard-deletes.

const TABLE = "linesheets";

async function readItems(id: string): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; items: LinesheetItem[] }> {
  const supabase = await createClient();
  const { data } = await supabase.from(TABLE).select("items").eq("id", id).maybeSingle();
  return { supabase, items: normalizeItems(data?.items) };
}

async function writeItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  items: LinesheetItem[]
) {
  await supabase.from(TABLE).update({ items, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/linesheets");
  revalidatePath(`/linesheets/${id}`);
}

export async function createLinesheet(form: FormData) {
  const name = (form.get("name") as string)?.trim();
  if (!name) return;
  const kind = normalizeKind(form.get("kind"));
  const subtitle = ((form.get("subtitle") as string) || "").trim() || null;
  const supabase = await createClient();
  const user = await requireUser();
  const brand = await activeBrand();
  const { data } = await supabase
    .from(TABLE)
    .insert({ name, kind, subtitle, items: [], brand, created_by: user?.email ?? null })
    .select("id")
    .single();
  revalidatePath("/linesheets");
  if (data?.id) redirect(`/linesheets/${data.id}`);
}

export async function renameLinesheet(id: string, form: FormData) {
  await requireUser();
  const name = (form.get("name") as string)?.trim();
  if (!name) return;
  const supabase = await createClient();
  await supabase.from(TABLE).update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/linesheets");
  revalidatePath(`/linesheets/${id}`);
}

export async function setLinesheetKind(id: string, kind: string, subtitle: string | null) {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({
      kind: normalizeKind(kind),
      subtitle: (subtitle || "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/linesheets");
  revalidatePath(`/linesheets/${id}`);
}

export async function addStylesToLinesheet(id: string, styleIds: string[]) {
  await requireUser();
  const { supabase, items } = await readItems(id);
  const next = addItems(items, styleIds);
  if (next.length === items.length) return; // nothing new
  await writeItems(supabase, id, next);
}

export async function removeStyleFromLinesheet(id: string, styleId: string) {
  await requireUser();
  const { supabase, items } = await readItems(id);
  const next = removeItem(items, styleId);
  if (next.length === items.length) return;
  await writeItems(supabase, id, next);
}

export async function reorderLinesheet(id: string, orderedIds: string[]) {
  await requireUser();
  const { supabase, items } = await readItems(id);
  await writeItems(supabase, id, reorderItems(items, orderedIds));
}

// The per-item merchandising fields the style row does not carry: Estimated
// Retail and the positioning note.
export async function setLinesheetItem(
  id: string,
  styleId: string,
  patch: { price?: string | null; note?: string | null }
) {
  await requireUser();
  const { supabase, items } = await readItems(id);
  await writeItems(supabase, id, setItemField(items, styleId, patch));
}

// The style's colours on this sheet — edited here without touching the style row
// (Tess, 2026-08-12: "add ability to add / remove colors from styles on line
// sheet in detail view"). Always writes an explicit list; [] means "no colours".
export async function setLinesheetColors(
  id: string,
  styleId: string,
  colors: LinesheetColorName[]
) {
  await requireUser();
  const { supabase, items } = await readItems(id);
  await writeItems(supabase, id, setItemColors(items, styleId, colors));
}

// Delete a linesheet — soft, like everything else in the app: a deleted_at
// timestamp takes it off the list and Restore (setting it back to null) would
// bring it whole (Tess, 2026-08-12: "add ability to delete a line sheet").
export async function deleteLinesheet(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/linesheets");
  redirect("/linesheets");
}

export async function archiveLinesheet(id: string, archived: boolean) {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/linesheets");
}

// --- Notes (Tess, 2026-08-12: "users would have the ability to leave notes in it
// like the moodboard"). Stored in the linesheets.notes jsonb, threaded, with the
// same god-mode edit/delete rule the moodboard notes carry. ---

async function readNotes(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from(TABLE).select("notes").eq("id", id).maybeSingle();
  return { supabase, notes: normalizeNotes(data?.notes) };
}

async function writeNotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  notes: Note[]
) {
  await supabase.from(TABLE).update({ notes, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/linesheets/${id}`);
}

export async function addLinesheetNote(id: string, form: FormData) {
  const text = ((form.get("text") as string) || "").trim();
  if (!text) return;
  const user = await requireUser();
  const { supabase, notes } = await readNotes(id);
  const note: Note = {
    tid: crypto.randomUUID(),
    text,
    by: user?.name || user?.email || "Someone",
    ts: Date.now(),
    replies: [],
  };
  await writeNotes(supabase, id, addNote(notes, note));
}

export async function addLinesheetReply(id: string, tid: string, form: FormData) {
  const text = ((form.get("text") as string) || "").trim();
  if (!text) return;
  const user = await requireUser();
  const { supabase, notes } = await readNotes(id);
  await writeNotes(
    supabase,
    id,
    addReplyTo(notes, tid, {
      id: crypto.randomUUID(),
      by: user?.name || user?.email || "Someone",
      ts: Date.now(),
      text,
    })
  );
}

// The author may edit their own; god mode (a named super-admin, or preview) may
// edit anyone's. Re-checked here, not trusted from the client.
export async function editLinesheetNote(id: string, tid: string, text: string) {
  const t = (text || "").trim();
  if (!t) return;
  const user = await requireUser();
  const me = user?.name || user?.email || "";
  const godMode = DEV_BYPASS || checkSuperAdmin(user?.email);
  const { supabase, notes } = await readNotes(id);
  const note = findNote(notes, tid);
  if (!note) return;
  if (!(godMode || (me && note.by === me))) return;
  await writeNotes(supabase, id, setNoteText(notes, tid, t));
}

// Delete is god mode only, like the moodboard.
export async function deleteLinesheetNote(id: string, tid: string) {
  const user = await requireUser();
  if (!(DEV_BYPASS || checkSuperAdmin(user?.email))) return;
  const { supabase, notes } = await readNotes(id);
  const next = removeNote(notes, tid);
  if (next.length === notes.length) return;
  await writeNotes(supabase, id, next);
}
