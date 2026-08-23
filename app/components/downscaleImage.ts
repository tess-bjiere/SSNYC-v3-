// Shrink an image in the browser before it is uploaded (Tess, 2026-08-20: "trying
// to upload fabrics and it keeps saying the images are too big"). Camera JPEGs and
// scans routinely run 30–80 MB, well past the 25 MB Server-Action body limit, so
// the request was rejected before anything could resize it. Here the picture is
// drawn to a canvas at a sane maximum edge and re-encoded as JPEG, which brings a
// swatch photo down to well under a megabyte with no visible loss at the sizes the
// tool shows.
//
// This runs on the client (it needs the DOM) and only ever makes an image
// SMALLER: if it can't decode the file (HEIC/HEIF, which browsers can't draw), or
// the result wouldn't be smaller, the original is returned untouched and the
// server handles it as before. A crop chosen at upload time still lines up, because
// the crop rect is stored as fractions of the image, not pixels.

const MAX_EDGE = 2400; // plenty for a swatch; the grid and lightbox show far less
const QUALITY = 0.85;
const SKIP_UNDER = 4 * 1024 * 1024; // already small and web-friendly — leave it be

function isHeic(file: File): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) return file;
  if (isHeic(file)) return file; // can't be drawn to a canvas; the server converts it
  if (file.size <= SKIP_UNDER) return file;
  try {
    // `from-image` bakes in EXIF orientation so a phone photo isn't turned on its
    // side once it loses its metadata in the canvas.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob || blob.size >= file.size) return file; // no win — keep the original
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
