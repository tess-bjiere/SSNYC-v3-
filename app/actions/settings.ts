"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LIST_FIELDS, type ListsSetting } from "@/lib/lists";
import { requireUser } from "@/lib/access";

export type SaveResult = { ok: boolean; error?: string };

// The dropdown taxonomy lives in one `settings` row, `key = 'lists'`, written by
// the original tool and now by ours. The row is shared and small, so it is read
// back and merged rather than blindly overwritten — anything the original tool
// (or a future field) stores under a key we don't manage is copied through
// untouched instead of being dropped on the first save from v2.
export async function saveLists(next: ListsSetting): Promise<SaveResult> {
  await requireUser();
  const supabase = await createClient();

  const { data: current, error: readErr } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "lists")
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };

  const merged: ListsSetting = { ...((current?.value as ListsSetting) ?? {}) };
  for (const field of LIST_FIELDS) {
    const e = next?.[field];
    if (!e) continue;
    merged[field] = {
      added: Array.isArray(e.added) ? e.added : [],
      order: Array.isArray(e.order) ? e.order : [],
      removed: Array.isArray(e.removed) ? e.removed : [],
    };
  }

  const { error } = await supabase
    .from("settings")
    .upsert({ key: "lists", value: merged, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/library");
  revalidatePath("/editorial");
  return { ok: true };
}
