// The taxonomy behind every dropdown — Category, Garment, Season, Fabric, Color.
//
// The original tool lets Tess curate these lists from a "Manage list options"
// drawer: add an option, remove one with ×, drag to reorder. It does NOT store
// the resulting list. It stores a *diff* against a built-in vocabulary, in
// `settings.lists` (jsonb), one entry per field:
//
//   { category: { added: [...], order: [...], removed: [...] }, ... }
//
// So the rendered list has to be reconstructed the same way here, or v2 would
// show Tess a different set of options than the tool she has been using — and
// the curation she has already done (four fields' worth, dozens of edits) would
// be silently thrown away. That is exactly the kind of carry-over this rebuild
// is not allowed to lose.
//
// BASE_DEFAULTS below is the built-in vocabulary, reconstructed from the live
// data: every value that appears in a stored `order` or `removed` array, plus
// the values the original's drawer renders that appear in neither (those can
// only have come from the base list). Verified by replaying the real
// `settings.lists` through resolveList() and comparing to the drawer itself.

export type ListEdits = {
  added?: string[] | null;
  order?: string[] | null;
  removed?: string[] | null;
};

export type ListsSetting = Record<string, ListEdits | null | undefined>;

// The five fields the "Manage list options" drawer curates. Designer comes from
// its own `settings.designers` row, and Year is left to the data — the original
// manages neither in this drawer.
export const LIST_FIELDS = ["category", "garment", "season", "fabric", "color"] as const;
export type ListField = (typeof LIST_FIELDS)[number];

// The singular of each label, for "Add category…"-style prompts. Spelled out
// rather than derived: stripping a trailing "s" turns Categories into
// "Categorie".
export const LIST_SINGULARS: Record<ListField, string> = {
  category: "category",
  garment: "garment",
  season: "season",
  fabric: "fabric",
  color: "color",
};

export const LIST_LABELS: Record<ListField, string> = {
  category: "Categories",
  garment: "Garments",
  season: "Seasons",
  fabric: "Fabrics",
  color: "Colors",
};

// The original tool's built-in vocabulary. Nothing here is invented: every entry
// is a value the live `settings.lists` diffs against or the drawer renders.
export const BASE_DEFAULTS: Record<ListField, string[]> = {
  category: [
    "Womenswear", "Menswear", "Unisex", "Tops", "Bottoms", "Dresses", "Outerwear",
    "Knitwear", "Swimwear", "Accessories", "Intimates", "Fabric", "Color",
    "Editorial / Ads", "Product Images",
  ],
  garment: [
    "T-Shirt", "Tank", "Halter", "Halters", "Sweatshirt", "Button Down", "Button Downs",
    "Bodysuit", "Jean", "Jeans", "Sweatpant", "Lounge Pant", "Legging", "Pant", "Pants",
    "Skirt", "Skirts", "Midi", "Mini", "Maxi", "Short", "Sweater", "Cardigan", "Cardigans",
    "Knit Top", "Knit Tops", "Knit Bottom", "Knit Bottoms", "Knit Accessory",
    "Knit Accessories", "Knitwear", "Coat", "Coats", "Jacket", "Jackets", "Blazer",
    "Blazers", "Vest", "Trench Coat", "Raincoat", "Windbreak", "Parka", "One Piece",
    "Sleepwear", "Underwear", "Bra", "Bras", "Bikini Top", "Bikini Tops", "Bikini Bottom",
    "Bikini Bottoms", "Sock", "Hat", "Scarf", "Track Pant", "Bucket Bag", "Gift Card",
  ],
  season: ["Spring/Summer", "Fall/Winter", "Pre-Fall", "Pre-Spring", "Resort", "Swimwear"],
  fabric: [
    "Cotton", "Jersey", "French Terry", "Linan", "Mesh",
    "Butter Rib", "Cashmere", "Silk", "Swim",
  ],
  color: [
    "Black", "White", "Grey", "Beige", "Brown", "Navy", "Blue", "Green", "Red", "Pink",
    "Purple", "Orange", "Yellow", "Cream", "Gold", "Silver", "Multi", "Tan",
  ],
};

function clean(list: string[] | null | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

// The three edit arrays for one field, always present and always arrays —
// `Required<ListEdits>` would still admit null, and every caller here treats
// them as lists it can spread.
export type ResolvedEdits = { added: string[]; order: string[]; removed: string[] };

export function editsFor(lists: ListsSetting | null | undefined, field: string): ResolvedEdits {
  const e = lists?.[field] ?? {};
  return { added: clean(e?.added), order: clean(e?.order), removed: clean(e?.removed) };
}

// The list a dropdown shows, in the order it shows it.
//
// Precedence: `order` first (that is the drag-to-reorder result), then whatever
// is left of the base vocabulary, then anything added that reordering has not
// placed yet — so a freshly added option lands at the bottom of the list where
// you just typed it, not in the middle of it. `removed` wins over everything:
// the live data has values sitting in both `order` and `removed` ("Editorial /
// Ads", "Product Images") and the original does not render them.
export function resolveList(
  field: ListField,
  lists: ListsSetting | null | undefined
): string[] {
  const { added, order, removed } = editsFor(lists, field);
  const gone = new Set(removed.map((v) => v.toLowerCase()));
  const pool = dedupe([...order, ...(BASE_DEFAULTS[field] ?? []), ...added]);
  return pool.filter((v) => !gone.has(v.toLowerCase()));
}

// The list a *filter* shows. Same as resolveList, plus any value actually in use
// on a reference that the curated list no longer contains.
//
// The drawer says it out loud: "Removing an option doesn't change references
// already tagged with it." Those references still exist, so if a removed value
// vanished from the filter too, Tess would have no way to find them again. In-use
// strays are appended at the end, alphabetically, so they never disturb the
// curated order.
export function resolveFilterOptions(
  field: ListField,
  lists: ListsSetting | null | undefined,
  inUse: string[] = []
): string[] {
  const curated = resolveList(field, lists);
  const have = new Set(curated.map((v) => v.toLowerCase()));
  const strays = dedupe(clean(inUse))
    .filter((v) => !have.has(v.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return [...curated, ...strays];
}

// Designers live in their own `settings.designers` row — a flat curated array,
// no add/remove/order diff. In-use names that aren't on it are appended so a
// reference tagged with a designer Tess never curated is still reachable.
export function resolveDesigners(
  curated: string[] | null | undefined,
  inUse: string[] = []
): string[] {
  const base = dedupe(clean(curated));
  const have = new Set(base.map((v) => v.toLowerCase()));
  const strays = dedupe(clean(inUse)).filter((v) => !have.has(v.toLowerCase()));
  return [...base, ...strays].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Edits. Each returns a new ListsSetting; none mutates its input, so a failed
// save leaves the UI's copy untouched.
// ---------------------------------------------------------------------------

function withField(lists: ListsSetting | null | undefined, field: string, edits: Required<ListEdits>): ListsSetting {
  return { ...(lists ?? {}), [field]: edits };
}

// Adding an option that was previously removed un-removes it, which is how the
// original's "Add …" input doubles as an undo for a mistaken ×.
export function addOption(
  lists: ListsSetting | null | undefined,
  field: ListField,
  value: string
): ListsSetting {
  const v = (value ?? "").trim();
  if (!v) return { ...(lists ?? {}) };

  const e = editsFor(lists, field);
  const removed = e.removed.filter((r) => r.toLowerCase() !== v.toLowerCase());

  // If it is already visible there is nothing to do beyond the un-remove.
  const visible = resolveList(field, withField(lists, field, { ...e, removed }));
  if (visible.some((o) => o.toLowerCase() === v.toLowerCase())) {
    return withField(lists, field, { ...e, removed });
  }

  // Only `added` is touched. resolveList places un-ordered additions last, so
  // the new option appears at the bottom of the list without having to
  // materialise an `order` array for a field that never had one.
  return withField(lists, field, { ...e, added: dedupe([...e.added, v]), removed });
}

// Removing records the value in `removed` and leaves `added`/`order` alone —
// that is exactly the shape the live data is in, and it means a re-add restores
// the option to its old position instead of the bottom of the list.
export function removeOption(
  lists: ListsSetting | null | undefined,
  field: ListField,
  value: string
): ListsSetting {
  const v = (value ?? "").trim();
  if (!v) return { ...(lists ?? {}) };
  const e = editsFor(lists, field);
  if (e.removed.some((r) => r.toLowerCase() === v.toLowerCase())) return { ...(lists ?? {}) };
  return withField(lists, field, { ...e, removed: [...e.removed, v] });
}

// Reordering writes the whole visible list to `order`. Anything the caller left
// out keeps its existing relative position after the ones it did pass, so a
// partial list can never silently drop options.
export function reorderOptions(
  lists: ListsSetting | null | undefined,
  field: ListField,
  nextOrder: string[]
): ListsSetting {
  const e = editsFor(lists, field);
  const next = dedupe(clean(nextOrder));
  const have = new Set(next.map((v) => v.toLowerCase()));
  const rest = resolveList(field, lists).filter((v) => !have.has(v.toLowerCase()));
  return withField(lists, field, { ...e, order: [...next, ...rest] });
}

// Move one option one step up or down within its visible list. The drawer in v2
// uses arrows rather than drag — same result, and it works on a trackpad.
export function moveOption(
  lists: ListsSetting | null | undefined,
  field: ListField,
  value: string,
  delta: number
): ListsSetting {
  const visible = resolveList(field, lists);
  const i = visible.findIndex((v) => v.toLowerCase() === value.trim().toLowerCase());
  const j = i + delta;
  if (i < 0 || j < 0 || j >= visible.length) return { ...(lists ?? {}) };
  const next = [...visible];
  [next[i], next[j]] = [next[j], next[i]];
  return reorderOptions(lists, field, next);
}
