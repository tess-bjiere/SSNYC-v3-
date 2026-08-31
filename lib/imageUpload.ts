// The image-upload decisions shared by every uploader, kept here so they are
// decided once and tested (Tess, 2026-08-28: "we just uploaded iphone photos and
// are getting broken link errors"). iPhones shoot HEIC/HEIF, which uploads fine
// but which browsers other than Safari cannot draw — so the server converts it
// to JPEG on the way in. This module holds only the pure detection; the sharp
// conversion happens at the server-action edge, like the zip/inflate split.
//
// Dependency-free like the rest of lib.

/**
 * Is this upload a HEIC/HEIF photo?
 *
 * Checked two ways because an iPhone photo often arrives with the right MIME
 * ("image/heic") but sometimes with an EMPTY type, in which case only the file
 * name gives it away. Either signal is enough.
 */
export function isHeicUpload(name: string | null | undefined, type: string | null | undefined): boolean {
  const t = typeof type === "string" ? type : "";
  const n = typeof name === "string" ? name : "";
  return /hei[cf]/i.test(t) || /\.hei[cf]$/i.test(n.trim());
}

/**
 * Should this upload be accepted as an image?
 *
 * The plain gate is "the browser says it is an image" (MIME starts image/), but
 * that rejects an empty-MIME HEIC an iPhone hands over, so a HEIC by name is let
 * through as well — the caller converts it to JPEG before it is stored.
 */
export function isAcceptableImage(name: string | null | undefined, type: string | null | undefined): boolean {
  const t = typeof type === "string" ? type : "";
  return t.startsWith("image/") || isHeicUpload(name, type);
}
