// Thumbnail sizing.
//
// Every folder in the `references` bucket holds `full.<ext>` alongside a
// `thumb.jpg` — the layout the original tool established. Library and moodboard
// grids show dozens of images at once, so serving the full upload for each of
// them is the difference between a page that loads and one that crawls.
//
// The maths lives here on its own (and is tested in lib/thumbnail.test.mts); the
// actual downscale happens in the browser at upload time, in UploadModal.

export const THUMB_MAX = 600;

// Fit an image inside a `max` × `max` box, keeping its aspect ratio. Images
// already smaller than the box are left at their own size — upscaling a small
// upload would make a "thumbnail" bigger than the original.
export function thumbDims(
  width: number,
  height: number,
  max: number = THUMB_MAX
): { w: number; h: number } {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { w: 0, h: 0 }; // unreadable dimensions — caller should skip the thumb
  }
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}
