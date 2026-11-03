/**
 * Deciding what an import still needs to add (Tess, 2026-11-02: the Archival
 * images and the deck's photographers and models brought into SSYNC).
 *
 * The rule an import must keep is that it can be run again — by a second person,
 * after a failed half-run, or after the team has already tidied up — without
 * doubling anything and without undoing anybody's work. So every decision here
 * looks at the rows that exist INCLUDING the ones in Trash: an image someone
 * deleted after the first import stays deleted, it is not quietly added back.
 *
 * Pure and dependency-free, like the rest of lib/: structural types only. The
 * server action (app/actions/seeds.ts) reads the rows, asks this module, writes.
 */

export type ExistingRow = {
  id: string;
  type: string | null;
  image_url: string | null;
  thumb_url?: string | null;
  photographer: string | null;
  model: string | null;
  deleted_at: string | null;
};

const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Archival seed rows not yet in the table. A row counts as present when any
 * archival row — live or in Trash — already points at the same image.
 */
export function planArchival<T extends { image: string }>(seed: readonly T[], existing: readonly ExistingRow[]): T[] {
  const have = new Set(existing.filter((r) => r.type === "archival").map((r) => r.image_url));
  const seen = new Set<string>();
  return seed.filter((s) => {
    if (have.has(s.image) || seen.has(s.image)) return false;
    seen.add(s.image);
    return true;
  });
}

export type BorrowSpec = { id?: string; photographer?: string; model?: string };

/**
 * The saved SSYNC row a seed borrows its picture from: by id, else the first row
 * credited with that photographer / pictured model, outside the directory's own
 * type (so a person never borrows from themselves). Trash counts — the picture
 * is still in storage, and borrowing it is the point.
 */
export function findBorrow(
  spec: BorrowSpec | undefined,
  rows: readonly ExistingRow[],
  ownType: string
): ExistingRow | null {
  if (!spec) return null;
  const withImage = rows.filter((r) => !!r.image_url && r.type !== ownType);
  if (spec.id) return withImage.find((r) => r.id === spec.id) ?? null;
  if (spec.photographer) return withImage.find((r) => key(r.photographer) === key(spec.photographer)) ?? null;
  if (spec.model) return withImage.find((r) => key(r.model) === key(spec.model)) ?? null;
  return null;
}

export type PersonSeedLike = {
  name: string;
  location: string;
  images: readonly { src: string; credit?: string; note?: string }[];
  borrow?: BorrowSpec;
};

export type PlannedPersonRow = {
  name: string;
  location: string;
  image_url: string | null;
  thumb_url: string | null;
  /** Who took this picture, for a model row. */
  credit: string | null;
  note: string | null;
};

/**
 * The rows a people import still needs to write.
 *
 *   images     one row per seed image not already on one of this person's own
 *              rows (any state);
 *   borrowed   one row for the borrowed picture, on the same terms;
 *   name only  when there is no picture to add and the person has no row of the
 *              directory's own type at all, one image-less row so a card exists.
 *              Skipped for someone already in the directory through other rows
 *              (a photographer's Campaign credits) unless a base city is known —
 *              without one it would only add a second, blank card under
 *              "Unspecified city".
 *
 * A person whose own rows are all in Trash has been removed on purpose, so
 * nothing is added for them.
 */
export function planPeople(
  kind: "photographer" | "model",
  ownType: string,
  rowTypes: readonly string[],
  seeds: readonly PersonSeedLike[],
  existing: readonly ExistingRow[]
): PlannedPersonRow[] {
  const nameOf = (r: ExistingRow) => (kind === "model" ? r.model : r.photographer);
  const out: PlannedPersonRow[] = [];
  for (const s of seeds) {
    const k = key(s.name);
    if (!k) continue;
    const own = existing.filter((r) => r.type === ownType && key(nameOf(r)) === k);
    const ownImages = new Set(own.map((r) => r.image_url).filter(Boolean));
    const removedOnPurpose = own.length > 0 && own.every((r) => r.deleted_at);
    if (removedOnPurpose) continue;

    const planned: PlannedPersonRow[] = [];
    for (const img of s.images) {
      if (ownImages.has(img.src)) continue;
      ownImages.add(img.src);
      planned.push({
        name: s.name,
        location: s.location,
        image_url: img.src,
        thumb_url: img.src,
        credit: img.credit ?? null,
        note: img.note ?? null,
      });
    }
    const b = findBorrow(s.borrow, existing, ownType);
    // A live borrowed picture whose credit already names this person is on
    // their profile through its tag (people phase 2, 2026-11-02: one picture, no
    // copies) — so no second row is written for it. One in Trash is not on any
    // profile, so it is still borrowed.
    const alreadyTagged = !!b && !b.deleted_at && key(nameOf(b)) === k;
    if (b?.image_url && !ownImages.has(b.image_url) && !alreadyTagged) {
      ownImages.add(b.image_url);
      planned.push({
        name: s.name,
        location: s.location,
        image_url: b.image_url,
        thumb_url: b.thumb_url ?? b.image_url,
        credit: kind === "model" ? b.photographer ?? null : null,
        note: "From the reference saved in SSYNC",
      });
    }
    if (planned.length === 0 && own.length === 0) {
      const inDirectory = existing.some(
        (r) => !r.deleted_at && rowTypes.includes(r.type ?? "") && key(nameOf(r)) === k
      );
      if (!inDirectory || s.location.trim()) {
        planned.push({ name: s.name, location: s.location, image_url: null, thumb_url: null, credit: null, note: null });
      }
    }
    out.push(...planned);
  }
  return out;
}
