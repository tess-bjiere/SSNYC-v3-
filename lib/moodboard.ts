// Moodboard data model — matches the existing `moodboards.items` jsonb shape so
// boards created in the original tool render correctly and stay compatible.

export type MBImageItem = {
  kind?: null | undefined; // image items have no `kind`
  iid: string;
  /**
   * The library reference this tile shows, or "" when the tile is a style.
   *
   * Kept required and kept first because every tile written by the original
   * tool has one, and nothing about those rows changes.
   */
  ref_id: string;
  /**
   * A style in development, shown by its cover photograph (Tess, 2026-08-06:
   * "You should be able to add styles in development to moodboards").
   *
   * Added 2026-08-06 and optional forever: a tile has EITHER a ref_id or a
   * style_id, and every tile that existed before this line has a ref_id. No
   * migration, no backfill, no schema change — items is jsonb and an absent key
   * already means "not a style", which is true of all of them.
   *
   * The board still owns nothing: this is an id pointing at the styles table,
   * exactly as ref_id points at references, so removing the tile removes the
   * tile and the style is untouched.
   */
  style_id?: string | null;
  x: number;
  y: number;
  z: number;
  w: number;
  gi?: number;
};

export type MBDividerItem = {
  kind: "divider";
  tid: string;
  text: string;
  x: number;
  y: number;
  z: number;
  w: number;
  gi?: number;
};

export type MBReply = {
  id: string;
  by?: string;
  ts?: number;
  text: string;
};

export type MBTextItem = {
  kind: "text";
  tid: string;
  text: string;
  x: number;
  y: number;
  z: number;
  w: number;
  by?: string;
  ts?: number;
  listOnly?: boolean;
  gi?: number;
  replies?: MBReply[];
};

export type MBItem = MBImageItem | MBDividerItem | MBTextItem;

export type Moodboard = {
  id: string;
  name: string;
  items: MBItem[];
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  pages: number | null;
  archived: boolean | null;
};

// ---------------------------------------------------------------------------
// Pure board transforms.
//
// These live here (rather than inline in the server actions) so they can be
// reasoned about and tested without a database: every one of them takes the
// board's `items` array and returns a new one. They never drop an item — the
// standing rule is that everything already stored on a board survives an edit.
// ---------------------------------------------------------------------------

// Persist a new reading order. `orderedIds` is the full sequence of divider tids
// and image iids as the grid shows them; each matching item's `gi` becomes its
// position, which reconstructs order + section membership in one pass.
//
// One exception keeps boards stable: an image that was *already* unsectioned and
// still sits after the last divider stays unsectioned, so the trailing group is
// not silently absorbed into the last named section by an unrelated drag. An
// image that already belonged to a section keeps its section even when it is the
// last thing on the board, and a loose image dragged up above a divider is filed
// into that section — both of those are deliberate moves.
export function applyReorder(items: MBItem[], orderedIds: string[]): MBItem[] {
  const pos = new Map(orderedIds.map((id, i) => [id, i]));

  let lastDividerPos = -1;
  for (const it of items) {
    const d = it as MBDividerItem;
    if (d.kind === "divider" && pos.has(d.tid)) {
      lastDividerPos = Math.max(lastDividerPos, pos.get(d.tid) as number);
    }
  }

  return items.map((it) => {
    const kind = itemKind(it);
    if (kind === "text") return it;
    const isDivider = kind === "divider";
    const id = isDivider ? (it as MBDividerItem).tid : (it as MBImageItem).iid;
    if (!pos.has(id)) return it;
    const at = pos.get(id) as number;
    const wasLoose = typeof it.gi !== "number";
    if (!isDivider && wasLoose && at > lastDividerPos) return it;
    return { ...it, gi: at };
  });
}

// Insert new image items into a board. With no `sectionTid` they are appended
// unsectioned at the end (the behaviour adds had before section targeting).
// With one, they are spliced in at the end of that section and that run of `gi`s
// is renumbered; notes and unsectioned items are carried through untouched.
export function insertItems(
  items: MBItem[],
  additions: MBImageItem[],
  sectionTid?: string | null
): MBItem[] {
  if (!additions.length) return items;
  if (!sectionTid) return [...items, ...additions];

  const notes = items.filter((i) => itemKind(i) === "text");
  const positioned = items.filter((i) => itemKind(i) !== "text");
  const ordered = positioned
    .filter((i) => typeof i.gi === "number")
    .sort((a, b) => (a.gi as number) - (b.gi as number) || a.z - b.z);
  const loose = positioned.filter((i) => typeof i.gi !== "number");

  const start = ordered.findIndex(
    (it) => itemKind(it) === "divider" && (it as MBDividerItem).tid === sectionTid
  );
  // Section vanished between render and click — fall back to the end of the board.
  if (start < 0) return [...items, ...additions];

  let end = start + 1;
  while (end < ordered.length && itemKind(ordered[end]) !== "divider") end += 1;

  const merged = [...ordered.slice(0, end), ...additions, ...ordered.slice(end)];
  const renumbered = merged.map((it, i) => ({ ...it, gi: i }));
  return [...notes, ...renumbered, ...loose];
}

/**
 * What a tile points at, prefixed so a style and a reference can never collide.
 *
 * A tile with neither returns "" and is treated as unique — a tile pointing at
 * nothing is already broken, and collapsing all of them into one would hide how
 * many there are.
 */
export function imageKey(im: MBImageItem): string {
  const style = typeof im.style_id === "string" ? im.style_id.trim() : "";
  if (style) return "style:" + style;
  const ref = typeof im.ref_id === "string" ? im.ref_id.trim() : "";
  return ref ? "ref:" + ref : "";
}

// Remove a single image from a board. Only the one tile with this `iid` goes —
// the same reference placed elsewhere on the board is untouched, dividers and
// notes are untouched, and the surviving items keep their existing `gi`s so
// nothing changes section. Removing leaves a gap in the `gi` sequence, which is
// fine: `toSections` reads gi as an order, not as an index.
export function removeImage(items: MBItem[], iid: string): MBItem[] {
  return items.filter(
    (it) => !(itemKind(it) === "image" && (it as MBImageItem).iid === iid)
  );
}

// Note on `w`: image items carry a stored width from the original tool. The grid
// renders every tile at one uniform size (the board's S/M/L base), so `w` is not
// read at render time — but it is deliberately never rewritten or stripped either.
// It stays in the jsonb exactly as the old tool left it.

export function itemKind(i: MBItem): "image" | "divider" | "text" {
  if ((i as MBDividerItem).kind === "divider") return "divider";
  if ((i as MBTextItem).kind === "text") return "text";
  return "image";
}

// Group a board's items into labeled sections. Boards store a `gi` (group index)
// that defines the linear order + section membership, exactly how the original
// grid view reconstructs sections: walk items in `gi` order, a divider opens a new
// section, and following images belong to it. Items without a `gi` (older or newly
// added refs) fall into a trailing unsectioned group. Canvas x/y is ignored here.
export type Section = { label: string | null; tid?: string; images: MBImageItem[] };

export function toSections(items: MBItem[]): { sections: Section[]; notes: MBTextItem[] } {
  const notes = items.filter((i) => itemKind(i) === "text") as MBTextItem[];
  const positioned = items.filter((i) => itemKind(i) !== "text");

  const gi = (i: MBItem) => (typeof i.gi === "number" ? i.gi : Number.POSITIVE_INFINITY);
  const withGi = positioned
    .filter((i) => typeof i.gi === "number")
    .sort((a, b) => gi(a) - gi(b) || a.z - b.z);
  const unsectioned = positioned.filter(
    (i) => typeof i.gi !== "number" && itemKind(i) === "image"
  ) as MBImageItem[];

  const sections: Section[] = [];
  let current: Section | null = null;

  for (const it of withGi) {
    if (itemKind(it) === "divider") {
      const d = it as MBDividerItem;
      current = { label: d.text?.trim() || "Untitled section", tid: d.tid, images: [] };
      sections.push(current);
    } else {
      if (!current) {
        current = { label: null, images: [] };
        sections.push(current);
      }
      current.images.push(it as MBImageItem);
    }
  }

  // De-duplicate images by what they point at (same thing placed multiple
  // times) across the board, keeping the first occurrence — removes the
  // duplicate pile at the bottom.
  const seen = new Set<string>();
  const fresh = (im: MBImageItem) => {
    const key = imageKey(im);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  for (const s of sections) s.images = s.images.filter(fresh);
  const freshUnsectioned = unsectioned.filter(fresh);

  // Keep sections that have images OR a real divider label (so empty named sections
  // still show and can receive images), then append any leftover unsectioned images.
  const cleaned = sections.filter((s) => s.images.length > 0 || s.tid);
  if (freshUnsectioned.length) cleaned.push({ label: null, images: freshUnsectioned });

  return { sections: cleaned, notes };
}
