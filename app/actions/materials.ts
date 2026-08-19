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
  "price", "moq", "lead_time", "notes",
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

function imageFiles(form: FormData): File[] {
  return form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/"));
}

// Add a fabric or trim, born into the brand you're looking at.
export async function createMaterial(
  form: FormData
): Promise<{ ok: boolean; id?: string; errors: string[] }> {
  const user = await requireFredTeam();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { ok: false, errors: ["A name is required."] };
  const kind = form.get("kind") === "trim" ? "trim" : "fabric";

  const supabase = await createClient();
  const brand = await activeBrand();
  const row: Record<string, unknown> = { brand, kind, created_by: user?.email ?? null };
  for (const k of FIELDS) {
    const v = form.get(k);
    if (typeof v === "string" && v.trim()) row[k] = v.trim();
  }
  row.name = name;

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

// Edit the fields of an existing material (the detail-view form).
export async function updateMaterial(id: string, patch: Record<string, string | null>) {
  await requireFredTeam();
  if (!id) return;
  const clean: Record<string, string | null> = {};
  for (const k of FIELDS) {
    if (k in patch) {
      const v = patch[k];
      clean[k] = typeof v === "string" && v.trim() === "" ? null : (v ?? null);
    }
  }
  if (Object.keys(clean).length === 0) return;
  const supabase = await createClient();
  await supabase
    .from("materials")
    .update({ ...clean, updated_at: new Date().toISOString() })
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
