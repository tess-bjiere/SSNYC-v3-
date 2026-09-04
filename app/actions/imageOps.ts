// Server-side image operations shared by the uploaders (materials, references).
// Kept out of lib/ because they need sharp; kept out of any one action file so
// crop-on-upload works the same wherever an image is added (Tess, 2026-09-04:
// crop on the reference library upload and on adding images to a reference).
//
// Never import this from a client component — it pulls in sharp.

import sharp from "sharp";

/** A crop as fractions of the image (0..1), the shape the cropper hands back. */
export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * Cut a normalized rect out of an image and return a JPEG. The rect is clamped
 * to the (rotation-corrected) image so a bad or slightly-off rectangle can never
 * ask sharp to extract outside the bounds. Moved here verbatim from the materials
 * uploader so both paths crop identically.
 */
export async function cropBuffer(buf: Uint8Array, rect: CropRect): Promise<Uint8Array> {
  const upright = await sharp(buf).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return buf;
  const left = Math.max(0, Math.min(W - 1, Math.round(rect.x * W)));
  const top = Math.max(0, Math.min(H - 1, Math.round(rect.y * H)));
  const width = Math.max(1, Math.min(W - left, Math.round(rect.w * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(rect.h * H)));
  return await sharp(upright).extract({ left, top, width, height }).jpeg({ quality: 90 }).toBuffer();
}

/** A crop rect out of a form field, or null when absent/malformed. */
export function parseCrop(v: FormDataEntryValue | null | undefined): CropRect | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const o = JSON.parse(v) as Record<string, unknown>;
    if (["x", "y", "w", "h"].every((k) => typeof o?.[k] === "number")) {
      return { x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number };
    }
  } catch {
    /* not JSON — treat as no crop */
  }
  return null;
}

/** HEIC/HEIF (iPhone photos) → JPEG, upright. Browsers other than Safari can't
 *  draw HEIC, so it is converted on the way in. */
export async function heicToJpeg(buf: Uint8Array): Promise<Uint8Array> {
  return await sharp(buf).rotate().jpeg({ quality: 85 }).toBuffer();
}

/** A small JPEG for the grid, made from an already-processed (cropped/converted)
 *  buffer so the thumbnail matches what was stored. */
export async function thumbFrom(buf: Uint8Array): Promise<Uint8Array> {
  return await sharp(buf)
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}
