"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { cropBuffer, parseCrop, heicToJpeg, thumbFrom, type CropRect } from "./imageOps";
import { isHeicUpload, isAcceptableImage } from "@/lib/imageUpload";

const BUCKET = "references";

// Metadata fields that can be attached at upload time. For a single upload these
// are that image's fields; for a bulk upload they are applied to every image.
const META_KEYS = [
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
  "notes",
  // Editorial-only fields. They are listed here rather than in a separate set
  // because the column list is the same table either way — a library upload
  // simply never sends them, and an absent key becomes null.
  "photographer",
  "photographer_ig",
  "model",
  "location",
] as const;

// `references.type` tells the Library grid and the Editorial grid apart. Only
// these two values are accepted; anything else falls back to a library
// reference, so a malformed request can never invent a third kind of row.
const KINDS = ["reference", "editorial"] as const;
type Kind = (typeof KINDS)[number];

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "jpg";
}

export type UploadResult = { ok: boolean; count: number; errors: string[] };

// Upload one or more image files to Storage and create a reference row for each.
// Files come in under the "files" key; shared metadata under the META_KEYS keys.
export async function uploadReferences(formData: FormData): Promise<UploadResult> {
  // Each file may be accompanied by a thumbnail the browser generated for it
  // (see makeThumb in UploadModal). They are paired by position, so the pairing
  // happens before any filtering — dropping a bad entry must not shift the rest.
  const rawFiles = formData.getAll("files");
  const rawThumbs = formData.getAll("thumbs");
  // A crop rect per file, position-matched like the thumbs — "" / absent means
  // the image is stored whole (Tess, 2026-09-04: crop on the reference upload).
  const rawCrops = formData.getAll("crops");
  const jobs = rawFiles
    .map((f, i) => {
      const t = rawThumbs[i];
      return {
        file: f,
        thumb: t instanceof File && t.size > 0 && t.type.startsWith("image/") ? t : null,
        crop: parseCrop(rawCrops[i]),
      };
    })
    .filter(
      // isAcceptableImage lets an empty-MIME iPhone HEIC through (converted below)
      // rather than rejecting it as "not an image".
      (j): j is { file: File; thumb: File | null; crop: CropRect | null } =>
        j.file instanceof File && j.file.size > 0 && isAcceptableImage(j.file.name, j.file.type)
    );

  if (jobs.length === 0) return { ok: false, count: 0, errors: ["No image files provided."] };

  const meta: Record<string, string | null> = {};
  for (const k of META_KEYS) {
    const v = (formData.get(k) as string | null)?.trim();
    meta[k] = v ? v : null;
  }

  const asked = (formData.get("type") as string | null)?.trim();
  const kind: Kind = KINDS.includes(asked as Kind) ? (asked as Kind) : "reference";

  const supabase = await createClient();
  const user = await requireUser();
  const createdBy = user?.name || user?.email || null;
  // A reference is uploaded into the brand you are looking at (multi-brand).
  const brand = await activeBrand();

  const errors: string[] = [];
  let count = 0;

  // "combine" makes the whole batch ONE profile — the first image is the main and
  // the rest its extra angles (Tess, 2026-09-09: "stack images of the same garment
  // ... into one profile"). Off (the default), each image becomes its own profile.
  const combine = (formData.get("combine") as string | null) === "1";

  // Upload every image first, collecting the stored URLs, so the reference row(s)
  // can be assembled once all the pictures are in place.
  const uploaded: { url: string; thumbUrl: string }[] = [];
  for (const { file, thumb, crop } of jobs) {
    try {
      const folder = crypto.randomUUID();
      let buf: Uint8Array = Buffer.from(await file.arrayBuffer());
      let ext = extFor(file.type);
      let contentType = file.type || "image/jpeg";
      // HEIC (iPhone) can't be drawn by most browsers; a crop is applied server-
      // side. Either one produces a JPEG, and either one makes the browser's own
      // thumbnail stale, so a fresh thumb is generated from the final bytes below.
      const heic = isHeicUpload(file.name, file.type);
      if (heic) {
        buf = await heicToJpeg(buf);
        ext = "jpg";
        contentType = "image/jpeg";
      }
      if (crop) {
        buf = await cropBuffer(buf, crop);
        ext = "jpg";
        contentType = "image/jpeg";
      }
      const path = `${folder}/full.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, { contentType, upsert: false });
      if (upErr) {
        errors.push(`${file.name}: ${upErr.message}`);
        continue;
      }
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ?? null;
      if (!url) {
        errors.push(`${file.name}: the image uploaded but has no public URL.`);
        continue;
      }

      // The thumbnail sits beside the full image at <folder>/thumb.jpg. If it fails
      // to upload, thumb_url just points at the full image. When the image was
      // processed (HEIC/crop) the browser thumb is of the ORIGINAL, so it is
      // regenerated from the stored bytes to match.
      let thumbUrl = url;
      const thumbBytes: Uint8Array | null =
        heic || crop ? await thumbFrom(buf) : thumb ? Buffer.from(await thumb.arrayBuffer()) : null;
      if (thumbBytes) {
        const thumbPath = `${folder}/thumb.jpg`;
        const { error: tErr } = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, thumbBytes, { contentType: "image/jpeg", upsert: false });
        if (!tErr) thumbUrl = supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data?.publicUrl ?? url;
      }
      uploaded.push({ url, thumbUrl });
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }

  // One reference row for the whole stack when combining, else one per image.
  const rows =
    combine && uploaded.length > 0
      ? [
          {
            image_url: uploaded[0].url,
            thumb_url: uploaded[0].thumbUrl,
            extra_images: uploaded.slice(1).map((u) => u.url),
          },
        ]
      : uploaded.map((u) => ({ image_url: u.url, thumb_url: u.thumbUrl }));
  for (const row of rows) {
    const { error: insErr } = await supabase
      .from("references")
      .insert({ ...meta, ...row, type: kind, brand, created_by: createdBy });
    if (insErr) errors.push(insErr.message);
    else count += 1;
  }

  if (count > 0) revalidatePath(kind === "editorial" ? "/editorial" : "/library");
  return { ok: count > 0, count, errors };
}
