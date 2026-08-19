"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFredTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import { REFERENCES_BUCKET } from "@/lib/storage";

// Every column a create/edit is allowed to set — kept explicit so a stray key
// can never touch id / created_by / deleted_at.
const FIELDS = [
  "name", "supplier", "supplier_ref", "composition", "color", "color_hex",
  "weight", "width", "construction", "finish", "trim_type", "size", "material",
  // Packaging's own type (Tess, 2026-08-19: "add packaging tab").
  "pack_type",
  "price", "moq", "lead_time", "notes",
  // 'stock' | 'custom' (Tess, 2026-08-19). Set from the add/edit form like the
  // rest; a blank clears it back to unset.
  "sourcing",
] as const;

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "jpg";
}

// Swatch images go into the same references bucket as everything else — a
// material's photo is a reference image like any other.
async function uploadImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  files: File[]
): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (isOversize(file.size)) {
      errors.push(oversizeError(file.name, file.size));
      continue;
    }
    try {
      const path = `${crypto.randomUUID()}/full.${extFor(file.type)}`;
      const { error: upErr } = await supabase.storage
        .from(REFERENCES_BUCKET)
        .upload(path, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) {
        errors.push(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }
  return { urls, errors };
}

// De-dupe and trim a list of strings, dropping blanks, order preserved — used
// for the products-used-for list on create and update.
function uniqTrim(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = (raw ?? "").trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function imageFiles(form: FormData): File[] {
  return form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/"));
}

// Add a fabric, trim or packaging item, born into the brand you're looking at.
export async function createMaterial(
  form: FormData
): Promise<{ ok: boolean; id?: string; errors: string[] }> {
  const user = await requireFredTeam();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, errors: ["A name is required."] };
  // fabric | trim | packaging (Tess, 2026-08-19: "add packaging tab" — before
  // this, anything that wasn't "trim" was filed as fabric, so packaging saved
  // as fabric).
  const kindRaw = form.get("kind");
  const kind = kindRaw === "trim" ? "trim" : kindRaw === "packaging" ? "packaging" : "fabric";

  const supabase = await createClient();
  const brand = await activeBrand();
  const row: Record<string, unknown> = { brand, kind, created_by: user?.email ?? null };
  for (const k of FIELDS) {
    const v = form.get(k);
    if (typeof v === "string" && v.trim()) row[k] = v.trim();
  }
  row.name = name;
  // Current-production flag from the form checkbox (Tess, 2026-08-19).
  if (form.get("current_production")) row.current_production = true;

  // The products (garments) this material is used for — repeated `garments`
  // fields off the multi-select. De-duped; empty stays the column default [].
  const garments = uniqTrim(form.getAll("garments").map((v) => String(v)));
  if (garments.length) row.garments = garments;

  const { urls, errors } = await uploadImages(supabase, imageFiles(form));
  if (urls[0]) {
    row.image_url = urls[0];
    row.thumb_url = urls[0];
  }
  if (urls.length > 1) row.extra_images = urls.slice(1);

  const { data, error } = await supabase.from("materials").insert(row).select("id").single();
  if (error) return { ok: false, errors: [...errors, error.message] };
  revalidatePath("/materials");
  return { ok: true, id: data?.id as string | undefined, errors };
}

// Edit the fields of an existing material (the detail-view form). `garments`,
// when passed, replaces the products-used-for list wholesale (an empty array
// clears it) — it is a separate channel because it is an array, not one of the
// text FIELDS.
export async function updateMaterial(
  id: string,
  patch: Record<string, string | null>,
  garments?: string[]
) {
  await requireFredTeam();
  if (!id) return;
  const clean: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (k in patch) {
      const v = patch[k];
      clean[k] = typeof v === "string" && v.trim() === "" ? null : (v ?? null);
    }
  }
  // Boolean flags arrive as "true"/"" strings in the same patch.
  if ("current_production" in patch) clean.current_production = patch.current_production === "true";
  if (garments !== undefined) clean.garments = uniqTrim(garments);
  if (Object.keys(clean).length === 0) return;
  const supabase = await createClient();
  await supabase
    .from("materials")
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/materials");
}

// Archive / unarchive a material — kept, not deleted; hidden from the default
// view until restored (Tess, 2026-08-19: "archive a fabric or a trim or
// packaging item").
export async function setMaterialArchived(id: string, archived: boolean) {
  await requireFredTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("materials")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/materials");
}

// Attach more swatch images to a material — appended to extra_images.
export async function addMaterialImages(
  id: string,
  form: FormData
): Promise<{ ok: boolean; errors: string[] }> {
  await requireFredTeam();
  const files = imageFiles(form);
  if (!id || files.length === 0) return { ok: false, errors: ["No image files provided."] };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("materials")
    .select("image_url,thumb_url,extra_images")
    .eq("id", id)
    .maybeSingle();
  const existing: unknown[] = Array.isArray(row?.extra_images) ? (row!.extra_images as unknown[]) : [];
  const { urls, errors } = await uploadImages(supabase, files);
  if (urls.length === 0) return { ok: false, errors };
  // If the material had no cover yet, the first upload becomes it.
  const patch: Record<string, unknown> = {};
  let rest = urls;
  if (!row?.image_url) {
    patch.image_url = urls[0];
    patch.thumb_url = urls[0];
    rest = urls.slice(1);
  }
  patch.extra_images = [...existing, ...rest];
  patch.updated_at = new Date().toISOString();
  await supabase.from("materials").update(patch).eq("id", id);
  revalidatePath("/materials");
  return { ok: true, errors };
}

// Soft delete — to Trash, recoverable — like everything else in the app.
export async function softDeleteMaterial(id: string) {
  await requireFredTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("materials")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/materials");
}

export async function restoreMaterial(id: string) {
  await requireFredTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("materials").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/materials");
}
