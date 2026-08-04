"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import {
  REFERENCES_BUCKET,
  referenceStoragePaths,
  safeToDelete,
  type ImageBearingRow,
} from "@/lib/storage";

// Fields the detail-view Edit form is allowed to change. Kept explicit so a
// stray key in the patch can never touch id / created_by / deleted_at, etc.
const EDITABLE = [
  "designer",
  "year",
  "season",
  "category",
  "garment",
  "fabric",
  "color",
  "color_hex",
  "price",
  "link",
  "photographer",
  "photographer_ig",
  "model",
  "location",
  "notes",
] as const;

export async function updateReference(id: string, patch: Record<string, string | null>) {
  await requireUser();
  if (!id) return;
  const clean: Record<string, string | null> = {};
  for (const k of EDITABLE) {
    if (k in patch) {
      const v = patch[k];
      clean[k] = typeof v === "string" && v.trim() === "" ? null : (v ?? null);
    }
  }
  if (Object.keys(clean).length === 0) return;

  const supabase = await createClient();
  await supabase.from("references").update(clean).eq("id", id);
  // A row can be on either grid and the edit form is shared, so both are
  // refreshed rather than guessing which page the edit came from.
  revalidatePath("/library");
  revalidatePath("/editorial");
}

// Soft delete: moves a reference to the Trash (recoverable) rather than
// permanently removing the row. Library queries already filter deleted_at IS NULL.
export async function softDeleteReference(id: string) {
  await requireUser();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("references")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/library");
  revalidatePath("/editorial");
  revalidatePath("/trash");
}

// Undo a soft delete — the row goes straight back into the Library with every
// field, image and moodboard placement exactly as it was. Nothing about a
// reference is changed on the way to the Trash, so nothing has to be rebuilt on
// the way back.
export async function restoreReference(id: string) {
  await requireUser();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("references").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/library");
  revalidatePath("/editorial");
  revalidatePath("/trash");
  revalidatePath("/moodboard");
}

export type PurgeResult = { ok: boolean; error?: string; filesRemoved: number };

// Permanently delete a reference: the row, and the image files behind it.
//
// This is the only irreversible operation in the app, so it is fenced in:
//   1. It refuses any row that is not already in the Trash. A reference must be
//      soft-deleted first, which means a purge can never be one stray click.
//   2. It only removes files it can prove belong to this row — objects in our
//      own bucket, resolved by lib/storage.ts.
//   3. It skips any file another reference still points at, so purging one row
//      can never blank out the images of another.
//   4. The row goes first and the files after, best effort. If the file cleanup
//      fails the worst case is an orphaned object in the bucket; the reverse
//      order would risk a surviving row with dead images, which is worse.
export async function purgeReference(id: string): Promise<PurgeResult> {
  await requireUser();
  if (!id) return { ok: false, error: "No reference given.", filesRemoved: 0 };
  const supabase = await createClient();

  const { data: row, error: readErr } = await supabase
    .from("references")
    .select("id,deleted_at,image,thumb,image_url,thumb_url,extra_images")
    .eq("id", id)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message, filesRemoved: 0 };
  if (!row) return { ok: false, error: "That reference no longer exists.", filesRemoved: 0 };
  if (!row.deleted_at) {
    // Guard 1 — a live reference is never purged, whatever the caller asked for.
    return { ok: false, error: "Move it to the Trash first.", filesRemoved: 0 };
  }

  // Guard 3 — everything every other row still points at, purged or not.
  const { data: others } = await supabase
    .from("references")
    .select("id,image,thumb,image_url,thumb_url,extra_images")
    .neq("id", id);
  const stillUsed = new Set<string>();
  for (const o of (others ?? []) as ImageBearingRow[]) {
    for (const p of referenceStoragePaths(o)) stillUsed.add(p);
  }

  const paths = safeToDelete(referenceStoragePaths(row as ImageBearingRow), stillUsed);

  const { error: delErr } = await supabase.from("references").delete().eq("id", id);
  if (delErr) return { ok: false, error: delErr.message, filesRemoved: 0 };

  let filesRemoved = 0;
  if (paths.length) {
    // Best effort: an orphaned file costs storage, it does not break anything.
    const { data: removed } = await supabase.storage.from(REFERENCES_BUCKET).remove(paths);
    filesRemoved = removed?.length ?? 0;
  }

  revalidatePath("/library");
  revalidatePath("/editorial");
  revalidatePath("/trash");
  revalidatePath("/moodboard");
  return { ok: true, filesRemoved };
}
