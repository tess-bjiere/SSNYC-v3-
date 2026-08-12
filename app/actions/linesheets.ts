"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import {
  addItems,
  removeItem,
  reorderItems,
  setItemField,
  normalizeItems,
  normalizeKind,
  type LinesheetItem,
} from "@/lib/linesheet";

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
  const season = ((form.get("season") as string) || "").trim() || null;
  const supabase = await createClient();
  const user = await requireUser();
  const brand = await activeBrand();
  const { data } = await supabase
    .from(TABLE)
    .insert({ name, kind, season, items: [], brand, created_by: user?.email ?? null })
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

export async function setLinesheetKind(id: string, kind: string, season: string | null) {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({
      kind: normalizeKind(kind),
      season: (season || "").trim() || null,
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

export async function archiveLinesheet(id: string, archived: boolean) {
  await requireUser();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/linesheets");
}
