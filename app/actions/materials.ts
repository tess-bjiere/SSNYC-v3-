"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import { REFERENCES_BUCKET } from "@/lib/storage";
import sharp from "sharp";
// The crop rect + sharp crop live in a shared module now, so materials and the
// reference uploaders crop identically (Tess, 2026-09-04).
import { cropBuffer, type CropRect } from "./imageOps";

// Every column a create/edit is allowed to set — kept explicit so a stray key
// can never touch id / created_by / deleted_at.
const FIELDS = [
  "name", "supplier", "supplier_ref", "composition", "color", "color_hex",
  "weight", "width", "construction", "finish", "trim_type", "size", "material",
  // A trim/packaging item's stock colour and its printed-ink colour (Tess,
  // 2026-08-20: "add background colour and print colour as field on packaging
  // and trims").
  "background_color", "print_color",
  // Packaging's own type (Tess, 2026-08-19: "add packaging tab").
  "pack_type",
  // Customs classification (Tess, 2026-08-20: "add hs code to packaging fields").
  "hs_code",
  "price", "moq", "lead_time",
  // Link to the material's Illustrator artwork (Tess, 2026-08-20).
  "ai_file",
  // Internal notes, never printed on a purchase order, and the supplier-facing
  // half that IS printed (Tess, 2026-08-23: "split internal from supplier-facing").
  "notes",
  "supplier_notes",
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
// material's photo is a reference image like any other. `crop`, when given,
// applies to every file uploaded in this call (uploads run one file at a time,
// so in practice that is one image and one rect).
async function uploadImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  files: File[],
  crop?: CropRect | null
): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (isOversize(file.size)) {
      errors.push(oversizeError(file.name, file.size));
      continue;
    }
    try {
      let buf: Uint8Array = Buffer.from(await file.arrayBuffer());
      let ext = extFor(file.type);
      let contentType = file.type || "image/jpeg";
      // HEIC/HEIF (iPhone photos) upload fine but most browsers can't display
      // them, so convert to JPEG on the way in (Tess, 2026-08-20: "broaden to
      // accept heic"). sharp decodes HEIF; the stored image is a normal JPEG.
      const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
      if (isHeic) {
        buf = await sharp(buf).rotate().jpeg({ quality: 85 }).toBuffer();
        ext = "jpg";
        contentType = "image/jpeg";
      }
      // A crop chosen at upload time — the result is always a JPEG.
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

// A HEIC/HEIF file sometimes arrives with an empty MIME type, so accept image
// files by extension too (Tess, 2026-08-20: "broaden to accept heic").
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|hei[cf])$/i;
function isImageFile(f: File): boolean {
  return f.size > 0 && (f.type.startsWith("image/") || IMAGE_EXT.test(f.name));
}
function imageFiles(form: FormData): File[] {
  return form.getAll("files").filter((f): f is File => f instanceof File && isImageFile(f));
}

// A crop rect passed alongside an upload as a JSON `crop` field. Anything that is
// not four finite 0..1 numbers reads as "no crop", so a malformed value can never
// blank an image out.
function cropFrom(form: FormData): CropRect | null {
  const raw = form.get("crop");
  if (typeof raw !== "string" || !raw) return null;
  try {
    const o = JSON.parse(raw);
    const ok = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 1;
    if (ok(o.x) && ok(o.y) && ok(o.w) && ok(o.h) && o.w > 0 && o.h > 0) {
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Add a fabric, trim or packaging item, born into the brand you're looking at.
export async function createMaterial(
  form: FormData
): Promise<{ ok: boolean; id?: string; errors: string[] }> {
  const user = await requireTeam();
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

  const { urls, errors } = await uploadImages(supabase, imageFiles(form), cropFrom(form));
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
  await requireTeam();
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
  await requireTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("materials")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/materials");
}

// One image row can be a plain URL string or the importer's { image_url } object.
function extraUrlList(extra: unknown): string[] {
  if (!Array.isArray(extra)) return [];
  return extra
    .map((e) =>
      typeof e === "string"
        ? e
        : e && typeof e === "object"
          ? ((e as { image_url?: string }).image_url ?? "")
          : ""
    )
    .filter(Boolean);
}

// The material's full image list, cover first. Stored as image_url (the cover)
// plus extra_images (the rest); this is the single reader both delete and
// set-cover go through so the shape can never drift between them.
async function readImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
): Promise<string[]> {
  const { data: row } = await supabase
    .from("materials")
    .select("image_url,extra_images")
    .eq("id", id)
    .maybeSingle();
  const cover = (row?.image_url as string | null) || null;
  return [cover, ...extraUrlList(row?.extra_images)].filter(Boolean) as string[];
}
async function writeImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  urls: string[]
) {
  await supabase
    .from("materials")
    .update({
      image_url: urls[0] ?? null,
      thumb_url: urls[0] ?? null,
      extra_images: urls.slice(1),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/materials");
}

// Attach more swatch images to a material — appended after any it already has.
// Returns the added urls so the open detail can show them without a reload
// (Tess, 2026-08-20: "add multiple images to fabrics, trims and packaging").
export async function addMaterialImages(
  id: string,
  form: FormData
): Promise<{ ok: boolean; errors: string[]; urls: string[] }> {
  await requireTeam();
  const files = imageFiles(form);
  if (!id || files.length === 0) return { ok: false, errors: ["No image files provided."], urls: [] };
  const supabase = await createClient();
  const current = await readImages(supabase, id);
  const { urls, errors } = await uploadImages(supabase, files, cropFrom(form));
  if (urls.length === 0) return { ok: false, errors, urls: [] };
  await writeImages(supabase, id, [...current, ...urls]);
  return { ok: true, errors, urls };
}

// Remove one image from a material. If it was the cover, the next image becomes
// the cover. Storage cleanup is left to Trash/purge — this only drops the link.
export async function removeMaterialImage(id: string, url: string) {
  await requireTeam();
  if (!id || !url) return;
  const supabase = await createClient();
  const urls = (await readImages(supabase, id)).filter((u) => u !== url);
  await writeImages(supabase, id, urls);
}

// Rotate one of a material's images a quarter turn (default clockwise) and swap
// it in place (Tess, 2026-08-20: "add ability to rotate images as well"). The
// bytes are re-encoded server-side with sharp and stored as a fresh object, then
// the old link is replaced in the list so the image keeps its position (and its
// cover status). The previous object is left to Trash/purge, like a remove.
export async function rotateMaterialImage(
  id: string,
  url: string,
  deg: 90 | 180 | 270 = 90
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireTeam();
  if (!id || !url) return { ok: false, error: "Missing image." };
  const supabase = await createClient();
  const urls = await readImages(supabase, id);
  if (!urls.includes(url)) return { ok: false, error: "Image not found on this material." };
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Could not read image (${res.status}).` };
    const input = Buffer.from(await res.arrayBuffer());
    // rotate(angle) turns by an explicit multiple of 90 (EXIF is ignored when an
    // angle is passed) — exactly what a manual rotate button wants.
    const out = await sharp(input).rotate(deg).jpeg({ quality: 90 }).toBuffer();
    const path = `${crypto.randomUUID()}/full.jpg`;
    const { error: upErr } = await supabase.storage
      .from(REFERENCES_BUCKET)
      .upload(path, out, { contentType: "image/jpeg", upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
    const next = pub?.publicUrl;
    if (!next) return { ok: false, error: "Upload failed." };
    await writeImages(supabase, id, urls.map((u) => (u === url ? next : u)));
    return { ok: true, url: next };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Rotate failed." };
  }
}

// Brighten an existing image a step and swap it in place (Tess, 2026-08-20: "add
// ability to brighten images in tool"). Same shape as rotate/crop — fetch, adjust
// with sharp, store a fresh object, replace the link. `factor` multiplies
// lightness (1 = no change); clicks compound because each reads the already-
// brightened object. A darken step is the same call with a factor below 1.
export async function brightenMaterialImage(
  id: string,
  url: string,
  factor = 1.15
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireTeam();
  if (!id || !url) return { ok: false, error: "Missing image." };
  // Guard the multiplier so a bad value can't wash an image out entirely.
  const f = Number.isFinite(factor) ? Math.max(0.3, Math.min(2, factor)) : 1.15;
  const supabase = await createClient();
  const urls = await readImages(supabase, id);
  if (!urls.includes(url)) return { ok: false, error: "Image not found on this material." };
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Could not read image (${res.status}).` };
    const input = Buffer.from(await res.arrayBuffer());
    const out = await sharp(input).rotate().modulate({ brightness: f }).jpeg({ quality: 90 }).toBuffer();
    const path = `${crypto.randomUUID()}/full.jpg`;
    const { error: upErr } = await supabase.storage
      .from(REFERENCES_BUCKET)
      .upload(path, out, { contentType: "image/jpeg", upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
    const next = pub?.publicUrl;
    if (!next) return { ok: false, error: "Upload failed." };
    await writeImages(supabase, id, urls.map((u) => (u === url ? next : u)));
    return { ok: true, url: next };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Brighten failed." };
  }
}

// Re-crop an existing image to a normalized rect and swap it in place (Tess,
// 2026-08-20: crop scope "All uploads + re-crop"). Same shape as rotate: fetch the
// stored bytes, cut with sharp, store a fresh object, replace the link so the
// image keeps its position and cover. The old object is left to Trash/purge.
export async function cropMaterialImage(
  id: string,
  url: string,
  rect: CropRect
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireTeam();
  if (!id || !url) return { ok: false, error: "Missing image." };
  const supabase = await createClient();
  const urls = await readImages(supabase, id);
  if (!urls.includes(url)) return { ok: false, error: "Image not found on this material." };
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Could not read image (${res.status}).` };
    const input = Buffer.from(await res.arrayBuffer());
    const out = await cropBuffer(input, rect);
    const path = `${crypto.randomUUID()}/full.jpg`;
    const { error: upErr } = await supabase.storage
      .from(REFERENCES_BUCKET)
      .upload(path, out, { contentType: "image/jpeg", upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
    const next = pub?.publicUrl;
    if (!next) return { ok: false, error: "Upload failed." };
    await writeImages(supabase, id, urls.map((u) => (u === url ? next : u)));
    return { ok: true, url: next };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Crop failed." };
  }
}

// Make a given image the cover (the card thumbnail) — it moves to the front.
export async function setMaterialCover(id: string, url: string) {
  await requireTeam();
  if (!id || !url) return;
  const supabase = await createClient();
  const urls = await readImages(supabase, id);
  if (!urls.includes(url)) return;
  await writeImages(supabase, id, [url, ...urls.filter((u) => u !== url)]);
}

// Soft delete — to Trash, recoverable — like everything else in the app.
export async function softDeleteMaterial(id: string) {
  await requireTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("materials")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/materials");
}

export async function restoreMaterial(id: string) {
  await requireTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("materials").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/materials");
}
