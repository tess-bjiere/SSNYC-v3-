"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import { cropBuffer, parseCrop, heicToJpeg, type CropRect } from "./imageOps";
import { isHeicUpload, isAcceptableImage } from "@/lib/imageUpload";
import type { ExtraImage } from "@/lib/types";
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

// Bulk edit and bulk delete for the References and Campaign grids (Tess,
// 2026-08-19: "add bulk select / edit / delete option for references and
// campaign libraries"). Both take a list of ids and go through the same
// whitelist / soft-delete rules the single-row actions use — nothing here can
// touch a column the Edit form couldn't, and a delete is still only a move to
// Trash.

// Set the same field(s) on every selected reference. The UI only sends the keys
// the user actually filled, so a missing key leaves that field untouched; an
// explicit empty value clears it on all of them.
export async function bulkUpdateReferences(ids: string[], patch: Record<string, string | null>) {
  await requireUser();
  const cleanIds = Array.from(new Set(ids.filter(Boolean)));
  if (cleanIds.length === 0) return;
  const clean: Record<string, string | null> = {};
  for (const k of EDITABLE) {
    if (k in patch) {
      const v = patch[k];
      clean[k] = typeof v === "string" && v.trim() === "" ? null : (v ?? null);
    }
  }
  if (Object.keys(clean).length === 0) return;
  const supabase = await createClient();
  await supabase.from("references").update(clean).in("id", cleanIds);
  revalidatePath("/library");
  revalidatePath("/editorial");
}

// Move several references to Trash at once — recoverable, exactly like the
// single delete (which the library footer's Trash restores from).
export async function bulkSoftDeleteReferences(ids: string[]) {
  await requireUser();
  const cleanIds = Array.from(new Set(ids.filter(Boolean)));
  if (cleanIds.length === 0) return;
  const supabase = await createClient();
  await supabase
    .from("references")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", cleanIds);
  revalidatePath("/library");
  revalidatePath("/editorial");
  revalidatePath("/trash");
}

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "jpg";
}

// The url a stored extra-image row resolves to — the list holds either plain URL
// strings or the importer's { image_url, thumb_url } objects.
function extraUrl(e: unknown): string | null {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.image_url === "string") return o.image_url;
    if (typeof o.url === "string") return o.url;
  }
  return null;
}

// Attach more images to ONE reference — extra angles/views, appended to its
// `extra_images` list rather than becoming their own rows (Tess, 2026-08-12:
// "add functionality to upload multiple images for a single reference"). Uploaded
// to the same references bucket as the primary image; stored as plain URL strings
// (extraImageUrls reads both shapes). Returns the new list so the open modal can
// update without a reload.
export async function addReferenceImages(
  id: string,
  formData: FormData
): Promise<{ ok: boolean; extra_images: ExtraImage[]; errors: string[] }> {
  await requireUser();
  // Files paired with an optional crop rect by position (Tess, 2026-09-04:
  // "add more images, i should be able to drag them in and crop"). isAcceptable
  // lets an empty-MIME iPhone HEIC through, converted below.
  const rawCrops = formData.getAll("crops");
  const jobs = formData
    .getAll("files")
    .map((f, i) => ({ file: f, crop: parseCrop(rawCrops[i]) }))
    .filter(
      (j): j is { file: File; crop: CropRect | null } =>
        j.file instanceof File && j.file.size > 0 && isAcceptableImage(j.file.name, j.file.type)
    );
  if (!id || jobs.length === 0) {
    return { ok: false, extra_images: [], errors: ["No image files provided."] };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("references")
    .select("extra_images")
    .eq("id", id)
    .maybeSingle();
  const existing: unknown[] = Array.isArray(row?.extra_images) ? (row!.extra_images as unknown[]) : [];

  const added: string[] = [];
  const errors: string[] = [];
  for (const { file, crop } of jobs) {
    if (isOversize(file.size)) {
      errors.push(oversizeError(file.name, file.size));
      continue;
    }
    try {
      let buf: Uint8Array = Buffer.from(await file.arrayBuffer());
      let ext = extFor(file.type);
      let contentType = file.type || "image/jpeg";
      if (isHeicUpload(file.name, file.type)) {
        buf = await heicToJpeg(buf);
        ext = "jpg";
        contentType = "image/jpeg";
      }
      if (crop) {
        buf = await cropBuffer(buf, crop);
        ext = "jpg";
        contentType = "image/jpeg";
      }
      const path = `${crypto.randomUUID()}/full.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(REFERENCES_BUCKET)
        .upload(path, buf, { contentType, upsert: false });
      if (upErr) {
        errors.push(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) added.push(pub.publicUrl);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }

  const next = [...existing, ...added];
  if (added.length > 0) {
    await supabase.from("references").update({ extra_images: next }).eq("id", id);
    revalidatePath("/library");
    revalidatePath("/editorial");
  }
  return { ok: added.length > 0, extra_images: next as ExtraImage[], errors };
}

// Drop one extra image off a reference. The storage file is left in place (an
// orphaned file costs storage, it does not break anything — same stance as
// purgeReference); this only removes it from the row's `extra_images`.
export async function removeReferenceImage(
  id: string,
  url: string
): Promise<{ ok: boolean; extra_images: ExtraImage[] }> {
  await requireUser();
  if (!id || !url) return { ok: false, extra_images: [] };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("references")
    .select("extra_images")
    .eq("id", id)
    .maybeSingle();
  const existing: unknown[] = Array.isArray(row?.extra_images) ? (row!.extra_images as unknown[]) : [];
  const next = existing.filter((e) => extraUrl(e) !== url);
  await supabase.from("references").update({ extra_images: next }).eq("id", id);
  revalidatePath("/library");
  revalidatePath("/editorial");
  return { ok: true, extra_images: next as ExtraImage[] };
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

// Empty the Trash — permanently delete every trashed reference for the active
// brand in one go (Tess, 2026-08-19: "allow ability to empty the whole trash").
// The same fences purgeReference sets stay up: only rows already in the Trash
// are touched (the select filters to deleted_at IS NOT NULL), and a file is only
// removed if no surviving reference — in ANY brand, since the bucket is shared —
// still points at it. Styles are left alone; they have no permanent delete.
export async function emptyReferenceTrash(): Promise<{
  ok: boolean;
  error?: string;
  rowsRemoved: number;
  filesRemoved: number;
}> {
  await requireTeam();
  const supabase = await createClient();
  const brand = await activeBrand();

  const { data: trashed, error: readErr } = await supabase
    .from("references")
    .select("id,image,thumb,image_url,thumb_url,extra_images")
    .eq("brand", brand)
    .not("deleted_at", "is", null)
    // Guardrail (Tess, 2026-08-19): Empty Trash NEVER mass-purges photographer
    // roster rows. Losing the whole directory to one click is exactly what went
    // wrong; a trashed roster image can still be permanently removed one at a
    // time from its own card, but the sweep leaves them be.
    .neq("type", "roster");
  if (readErr) return { ok: false, error: readErr.message, rowsRemoved: 0, filesRemoved: 0 };
  const rows = (trashed ?? []) as (ImageBearingRow & { id: string })[];
  if (rows.length === 0) return { ok: true, rowsRemoved: 0, filesRemoved: 0 };
  const ids = new Set(rows.map((r) => r.id));

  // Guard 3, applied across the whole purge set at once: every path any row NOT
  // being purged still points at is off-limits.
  const { data: others } = await supabase
    .from("references")
    .select("id,image,thumb,image_url,thumb_url,extra_images");
  const stillUsed = new Set<string>();
  for (const o of (others ?? []) as (ImageBearingRow & { id: string })[]) {
    if (ids.has(o.id)) continue;
    for (const p of referenceStoragePaths(o)) stillUsed.add(p);
  }
  const toRemove = new Set<string>();
  for (const r of rows) {
    for (const p of safeToDelete(referenceStoragePaths(r), stillUsed)) toRemove.add(p);
  }

  const { error: delErr } = await supabase.from("references").delete().in("id", Array.from(ids));
  if (delErr) return { ok: false, error: delErr.message, rowsRemoved: 0, filesRemoved: 0 };

  let filesRemoved = 0;
  const pathList = Array.from(toRemove);
  if (pathList.length) {
    const { data: removed } = await supabase.storage.from(REFERENCES_BUCKET).remove(pathList);
    filesRemoved = removed?.length ?? 0;
  }

  revalidatePath("/library");
  revalidatePath("/editorial");
  revalidatePath("/trash");
  revalidatePath("/moodboard");
  return { ok: true, rowsRemoved: ids.size, filesRemoved };
}
