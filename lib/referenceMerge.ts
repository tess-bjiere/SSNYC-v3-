// Merging several reference profiles into one (Tess, 2026-09-09: "combine profile
// into one profile"). The keeper's own fields stay; every other profile's images
// are appended to it, then the others are trashed by the caller. This module holds
// only the pure image-list math so it can be tested; the database read/write and
// the soft-delete live in the server action.
//
// Dependency-free (types-only import), like the rest of lib.

import type { ExtraImage } from "./types";

/** The URL an extra_images entry points at (it may be a bare string or an object). */
export function extraImageUrl(e: ExtraImage): string {
  if (typeof e === "string") return e.trim();
  return (e?.image_url ?? "").trim();
}

type RefImages = {
  image_url?: string | null;
  extra_images?: ExtraImage[] | null;
};

/**
 * The keeper's extra_images after merging the others in.
 *
 * Order: the keeper's own extras first, then each other profile's main image and
 * its extras. De-duplicated by URL — the keeper's own main image is excluded (it
 * stays as image_url, not repeated as an extra), and an image already present is
 * not added twice, so merging the same thing twice is harmless.
 */
export function mergedExtraImages(keeper: RefImages, others: RefImages[]): ExtraImage[] {
  const seen = new Set<string>();
  const out: ExtraImage[] = [];
  const add = (e: ExtraImage) => {
    const u = extraImageUrl(e);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(e);
  };

  const keeperMain = (keeper.image_url ?? "").trim();
  if (keeperMain) seen.add(keeperMain); // never fold the keeper's main into its own extras

  for (const e of keeper.extra_images ?? []) add(e);
  for (const o of others) {
    const main = (o.image_url ?? "").trim();
    if (main) add(main);
    for (const e of o.extra_images ?? []) add(e);
  }
  return out;
}
