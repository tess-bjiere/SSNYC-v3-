// Mapping a reference's public image URLs back to Storage object paths.
//
// Permanently deleting a reference has to remove its files from the `references`
// bucket too, otherwise the bucket grows forever. Working out *which* objects
// belong to a row is the risky half of that — get it wrong and a purge deletes
// an image another reference is still using. So the mapping lives here as pure
// functions with no Supabase client, and is covered by lib/storage.test.mts.
//
// This file deliberately never deletes anything. See `purgeReference` in
// app/actions/references.ts for the caller, which additionally refuses to touch
// any path still referenced by another row.

export const REFERENCES_BUCKET = "references";

// Every image in this project lives at `<uuid-folder>/full.<ext>` with its
// thumbnail alongside at `<uuid-folder>/thumb.<ext>` — the layout the original
// tool used, which the new uploader kept.
export type ImageBearingRow = {
  image?: string | null;
  thumb?: string | null;
  image_url?: string | null;
  thumb_url?: string | null;
  extra_images?: unknown;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A public Supabase Storage URL looks like:
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
// Returns just the `<path>` part — what the Storage API's remove() wants — or
// null when the URL is not an object in this bucket (an external image, a
// different bucket, a data: URI, junk). Returning null is the safe answer:
// the caller simply won't delete anything for it.
export function storagePathFromUrl(
  url: unknown,
  bucket: string = REFERENCES_BUCKET
): string | null {
  if (typeof url !== "string" || !url) return null;
  const re = new RegExp(
    `/storage/v1/object/(?:public/|authenticated/|sign/)?${escapeRe(bucket)}/`
  );
  const m = re.exec(url);
  if (!m) return null;

  let path = url.slice(m.index + m[0].length);
  const cut = path.search(/[?#]/); // signed URLs carry a ?token=…
  if (cut >= 0) path = path.slice(0, cut);
  try {
    path = decodeURIComponent(path);
  } catch {
    // A malformed escape sequence — keep the raw path rather than throwing.
  }
  // A path that climbs out of the bucket is not something we made; refuse it.
  if (!path || path.startsWith("/") || path.split("/").includes("..")) return null;
  return path;
}

// Every image URL a reference row points at: its main image and thumbnail (in
// both the legacy `image`/`thumb` columns and the current `image_url`/`thumb_url`
// ones), plus each extra image. Order is stable and duplicates are collapsed.
//
// extra_images rows are stored either as plain URL strings or as
// { image_url, thumb_url } objects — both shapes appear in the live data.
export function referenceImageUrls(r: ImageBearingRow): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  };

  push(r.image_url);
  push(r.thumb_url);
  push(r.image);
  push(r.thumb);

  if (Array.isArray(r.extra_images)) {
    for (const e of r.extra_images) {
      if (typeof e === "string") {
        push(e);
      } else if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        push(o.image_url);
        push(o.thumb_url);
        push(o.image);
        push(o.thumb);
      }
    }
  }

  return out;
}

// The Storage object paths owned by a reference row — i.e. the files a purge
// would remove. Anything that isn't an object in `bucket` is dropped.
export function referenceStoragePaths(
  r: ImageBearingRow,
  bucket: string = REFERENCES_BUCKET
): string[] {
  const out: string[] = [];
  for (const url of referenceImageUrls(r)) {
    const p = storagePathFromUrl(url, bucket);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

// Given the paths a purge wants to delete and the paths still used by every
// *other* row, return only the ones that are genuinely unused. Two references
// can point at the same file — the old tool allowed the same upload to be
// attached twice — and deleting it would blank out the surviving row.
export function safeToDelete(candidates: string[], stillUsed: Iterable<string>): string[] {
  const used = new Set(stillUsed);
  return candidates.filter((p) => !used.has(p));
}
