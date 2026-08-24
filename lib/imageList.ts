/**
 * An ordered list of images living inside a jsonb column.
 *
 * Two things in the development tool needed the same shape and neither of them
 * wanted a table:
 *
 *   styles.photos.gallery        — more images of the style than the five fixed
 *                                  photography slots hold
 *   style_samples.photos.shots   — what actually arrived in this round
 *
 * So the list is a value in a jsonb map rather than rows anywhere. The whole map
 * is read and written together, which is why every function here takes the raw
 * jsonb and returns a NEW raw jsonb: keys this module does not recognise are
 * carried through untouched. That matters more than it sounds — styles.photos
 * also holds the fixed photography slots, and a gallery write that quietly
 * dropped them would delete a shoot.
 *
 * Ids are passed in rather than generated here. This module stays pure so it
 * can be unit-tested directly by node's test runner, and a function that
 * invents a uuid is not pure.
 *
 * Dependency-free on purpose.
 */

export type ListImage = {
  id: string;
  url: string;
  /** What this shot is. Optional everywhere; blank is the normal case. */
  caption: string;
};

/** Reserved key for the extra images on a style, inside styles.photos. */
export const GALLERY_KEY = "gallery";

/** Reserved key for the shots on a sample round, inside style_samples.photos. */
export const SHOTS_KEY = "shots";

/**
 * Reserved key for a style's colourways, inside styles.photos.
 *
 * Tess, 2026-08-07: "add a way to add multiple colors to a style profile --
 * maybe it's an option in the sketch profile section to upload other colors?"
 *
 * A third list beside gallery and shots rather than a table, for the same
 * reason as the other two: it is an ordered list of pictures belonging to one
 * row, and a table would buy nothing but a join. The colour NAME is the entry's
 * caption — the field is already there, already editable in place, and already
 * carried through every read and write in this file.
 *
 * styles.colors, the free-text line, is untouched and stays the one-line answer
 * quoted in an email ("black / bone / olive"). This is the same fact with a
 * picture attached, which is a different job: one is for reading, one is for
 * showing a factory which bone.
 */
export const COLORWAYS_KEY = "colorways";

function asObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Read one list out of a jsonb value.
 *
 * Three stored shapes are accepted, because over the life of the tool all three
 * will exist: a plain URL string (the simplest thing anyone would write by
 * hand), an object with url/caption, and an object using image_url — the key
 * the original importer wrote, and the one references.extra_images still uses.
 * Anything without a usable URL is dropped rather than rendered as a broken
 * frame. Ids are de-duplicated so a bad write can never produce two React keys
 * that collide.
 */
export function readImages(raw: unknown, key: string): ListImage[] {
  const box = asObject(raw)[key];
  if (!Array.isArray(box)) return [];

  const out: ListImage[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < box.length; i++) {
    const entry = box[i];
    let url = "";
    let caption = "";
    let id = "";

    if (typeof entry === "string") {
      url = str(entry);
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const e = entry as Record<string, unknown>;
      url = str(e.url) || str(e.image_url) || str(e.thumb_url);
      caption = str(e.caption);
      id = str(e.id);
    }

    if (!url) continue;
    // Falling back to the URL as the id keeps hand-written and legacy entries
    // addressable — you can still caption or remove one without a migration.
    let finalId = id || url;
    while (seen.has(finalId)) finalId = `${finalId}~${i}`;
    seen.add(finalId);

    out.push({ id: finalId, url, caption });
  }

  return out;
}

/** Write a list back into the map, preserving every other key. */
function withList(raw: unknown, key: string, list: ListImage[]): Record<string, unknown> {
  const next = asObject(raw);
  if (list.length === 0) delete next[key];
  else next[key] = list.map((im) => ({ id: im.id, url: im.url, caption: im.caption }));
  return next;
}

/**
 * Append an image. The id comes from the caller. A blank url is ignored rather
 * than stored, so a failed upload can never leave an empty frame behind, and an
 * id already in the list replaces that entry instead of duplicating it.
 */
export function withImageAdded(
  raw: unknown,
  key: string,
  image: { id: string; url: string | null | undefined; caption?: string | null }
): Record<string, unknown> {
  const url = str(image.url);
  const id = str(image.id);
  if (!url || !id) return asObject(raw);

  const list = readImages(raw, key);
  const next: ListImage = { id, url, caption: str(image.caption) };
  const at = list.findIndex((im) => im.id === id);
  if (at === -1) list.push(next);
  else list[at] = next;
  return withList(raw, key, list);
}

/**
 * Drop an image from the list.
 *
 * The stored object in the bucket is deliberately left alone — same rule as the
 * photography slots. Re-uploading is cheap and common; un-deleting is neither.
 */
export function withImageRemoved(raw: unknown, key: string, id: string): Record<string, unknown> {
  const want = str(id);
  if (!want) return asObject(raw);
  return withList(
    raw,
    key,
    readImages(raw, key).filter((im) => im.id !== want)
  );
}

/**
 * Replace one image's URL in place, keeping its id, caption and position. Crop /
 * rotate write a fresh file and swap the URL in — the entry is otherwise the same
 * shot (Tess, 2026-08-24: crop images in the style profile / samples). A blank
 * url, or an id not in the list, is a no-op rather than a corruption.
 */
export function withImageUrl(
  raw: unknown,
  key: string,
  id: string,
  url: string | null | undefined
): Record<string, unknown> {
  const want = str(id);
  const next = str(url);
  if (!want || !next) return asObject(raw);
  const list = readImages(raw, key);
  const at = list.findIndex((im) => im.id === want);
  if (at === -1) return asObject(raw);
  list[at] = { ...list[at], url: next };
  return withList(raw, key, list);
}

/** Re-caption one image. A blank caption clears it rather than storing "". */
export function withImageCaption(
  raw: unknown,
  key: string,
  id: string,
  caption: string | null | undefined
): Record<string, unknown> {
  const want = str(id);
  if (!want) return asObject(raw);
  const list = readImages(raw, key);
  const at = list.findIndex((im) => im.id === want);
  if (at === -1) return asObject(raw);
  list[at] = { ...list[at], caption: str(caption) };
  return withList(raw, key, list);
}

/**
 * Move an image one place earlier or later. Order is the only thing that says
 * which shot is the important one, so it has to be editable — and it has to be
 * editable by someone on a phone, which is why it is two arrows rather than
 * drag and drop.
 *
 * Moving past either end is a no-op, not a wrap-around.
 */
export function withImageMoved(
  raw: unknown,
  key: string,
  id: string,
  delta: number
): Record<string, unknown> {
  const want = str(id);
  const list = readImages(raw, key);
  const from = list.findIndex((im) => im.id === want);
  if (from === -1) return asObject(raw);

  const to = from + (delta < 0 ? -1 : 1);
  if (to < 0 || to >= list.length) return asObject(raw);

  const moved = list.slice();
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item);
  return withList(raw, key, moved);
}

/** "3 images" / "1 image" / "" — the count for a section heading. */
export function imageCountLabel(raw: unknown, key: string, noun = "image"): string {
  const n = readImages(raw, key).length;
  if (n === 0) return "";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
