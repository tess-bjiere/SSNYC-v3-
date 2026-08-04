"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";

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
  const jobs = rawFiles
    .map((f, i) => {
      const t = rawThumbs[i];
      return {
        file: f,
        thumb: t instanceof File && t.size > 0 && t.type.startsWith("image/") ? t : null,
      };
    })
    .filter(
      (j): j is { file: File; thumb: File | null } =>
        j.file instanceof File && j.file.size > 0 && j.file.type.startsWith("image/")
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

  const errors: string[] = [];
  let count = 0;

  for (const { file, thumb } of jobs) {
    try {
      const folder = crypto.randomUUID();
      const path = `${folder}/full.${extFor(file.type)}`;
      const buf = Buffer.from(await file.arrayBuffer());

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) {
        errors.push(`${file.name}: ${upErr.message}`);
        continue;
      }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = pub?.publicUrl ?? null;

      // The thumbnail sits beside the full image at <folder>/thumb.jpg, matching
      // the layout the original tool used. If it fails to upload, thumb_url just
      // points at the full image — a slower grid, never a missing one.
      let thumbUrl = url;
      if (thumb) {
        const thumbPath = `${folder}/thumb.jpg`;
        const { error: tErr } = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, Buffer.from(await thumb.arrayBuffer()), {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (!tErr) {
          const { data: tPub } = supabase.storage.from(BUCKET).getPublicUrl(thumbPath);
          thumbUrl = tPub?.publicUrl ?? url;
        }
      }

      const { error: insErr } = await supabase.from("references").insert({
        ...meta,
        image_url: url,
        thumb_url: thumbUrl,
        type: kind,
        created_by: createdBy,
      });
      if (insErr) {
        errors.push(`${file.name}: ${insErr.message}`);
        continue;
      }
      count += 1;
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }

  if (count > 0) revalidatePath(kind === "editorial" ? "/editorial" : "/library");
  return { ok: count > 0, count, errors };
}
