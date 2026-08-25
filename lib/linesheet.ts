// The linesheet — an ordered set of styles assembled for a season or as
// evergreen, shown as an assortment grid or one product per page and exported to
// PDF (Tess, 2026-08-12: "add a linesheet functionality to the product side").
//
// Pure and dependency-free like the rest of lib/. It owns two things: the stored
// shape (the ordered `items` list and the small edits done to it — add, remove,
// reorder, set a per-item price/note) and the render model each page lays out.
// The database read and the picture/round resolution live in the page, the same
// division the fitting deck uses. Both halves are unit-tested here.

export type LinesheetKind = "seasonal" | "evergreen";

export const LINESHEET_KINDS: { key: LinesheetKind; label: string }[] = [
  { key: "seasonal", label: "Seasonal" },
  { key: "evergreen", label: "Evergreen" },
];

// The page layout the whole sheet's Detail export uses (Tess, 2026-08-24: "have
// options for page layouts"). One choice per sheet. Each is the same market page
// — eyebrow, serif title, the Retail / Colour / Fabric / Delivery facts, the
// wordmark — differing only in the image zone:
//   flats     — the front/back technical sketches (works for every style)
//   model     — a styled/model photo as the hero, the flats small beside the facts
//   colorways — the colourway product photos as a grid
export type LinesheetLayout = "flats" | "model" | "colorways";

export const LINESHEET_LAYOUTS: { key: LinesheetLayout; label: string; hint: string }[] = [
  { key: "flats", label: "Flats", hint: "Front & back technical sketches" },
  { key: "model", label: "Model + flats", hint: "A styled photo, sketches beside the facts" },
  { key: "colorways", label: "Colorways", hint: "The colourway photos as a grid" },
];

/** Any input becomes one of the known layouts; unknown/absent reads as flats. */
export function normalizeLayout(raw: unknown): LinesheetLayout {
  return raw === "model" || raw === "colorways" ? raw : "flats";
}

// One entry in a linesheet's ordered contents. `style_id` is the only required
// part; a linesheet carries the merchandising facts the style row does not —
// `price` (Estimated Retail; styles have no price column) and `note` (the
// positioning line the paper linesheet prints) — plus, later, which `colorways`
// to show.
export type LinesheetItem = {
  style_id: string;
  price?: string;
  note?: string;
  // When this product ships, printed on the market page (Tess, 2026-08-24:
  // "Delivery: per product"). Free text — "February 15", "Drop 2", a date — since
  // a style has no delivery column; a blank removes it.
  delivery?: string;
  // The size run offered, printed on the market page (Tess, 2026-08-24:
  // "linesheets should also allow size listing"). Free text — "XS–XL", "S M L",
  // "One size" — since sizing is a merchandising choice per sheet, not a style
  // column; a blank removes it.
  sizes?: string;
  colorways?: string[];
  // A per-linesheet colour list, edited on the sheet without touching the style
  // (Tess, 2026-08-12: "add ability to add / remove colors from styles on line
  // sheet" + "use hex picker for adding color as well and give custom name").
  // Each colour is a custom name with an optional hex swatch. Present — even as []
  // — means "these are the colours for this style on this sheet"; absent means
  // "fall back to the style's own colours".
  colors?: LinesheetColorName[];
};

/** A colour on an entry: the colorway image and its name (its caption). */
export type LinesheetColor = { url: string; name: string };

/** A named colour on a linesheet's own colour list, with an optional hex swatch. */
export type LinesheetColorName = { name: string; hex: string | null };

/** One style, resolved for display. */
export type LinesheetEntry = {
  styleId: string;
  name: string;
  styleNo: string | null;
  garment: string | null;
  /** garment · season — the line under the name (style no is shown separately). */
  subtitle: string;
  price: string | null;
  fabric: string | null;
  /** The free-text colours line, used when there are no colorway images. */
  colors: string | null;
  /** Per-linesheet colours (name + optional hex); null = show the style's own. */
  colorOverride: LinesheetColorName[] | null;
  colorways: LinesheetColor[];
  sketchUrl: string | null;
  backUrl: string | null;
  /** A styled / model photo used as the hero on the "model" layout; null falls
   *  back to the sketch. */
  modelUrl: string | null;
  roundLabel: string | null;
  factory: string | null;
  /** "" | "good" | "workable" | "poor" — drives the rating dot; "" draws none. */
  rating: string;
  /** Per-item positioning note. */
  note: string | null;
  /** When this product ships, on the market page. */
  delivery: string | null;
  /** The size run offered, on the market page. */
  sizes: string | null;
  /** Nothing to show visually — no sketch and no colorway image. */
  empty: boolean;
};

export type LinesheetEntryInput = {
  styleId: string;
  name: string;
  styleNo?: string | null;
  garment?: string | null;
  season?: string | null;
  price?: string | null;
  fabric?: string | null;
  colors?: string | null;
  colorOverride?: LinesheetColorName[] | null;
  colorways?: LinesheetColor[];
  sketchUrl?: string | null;
  backUrl?: string | null;
  modelUrl?: string | null;
  roundLabel?: string | null;
  factory?: string | null;
  rating?: string | null;
  note?: string | null;
  delivery?: string | null;
  sizes?: string | null;
};

export type Linesheet = {
  name: string;
  kind: LinesheetKind;
  kindLabel: string;
  /** The optional free-text label under the title (was "season"). */
  subtitle: string | null;
  /** Which Detail page layout the whole sheet exports in. */
  layout: LinesheetLayout;
  entries: LinesheetEntry[];
  count: number;
};

// The click-through standing of a style: every factory working on the same
// garment (the style itself plus its siblings — separate profiles of the same
// garment at other factories), each with its rating and whether its latest round
// is approved (Tess, 2026-08-12: "a modal that shows the various factories
// working on the same style with the rating next to it ... click into any
// version"). Derived server-side from siblings + samples; the shape lives here so
// the page and the modal agree on it.
export type LinesheetVersion = {
  styleId: string;
  factory: string | null;
  roundLabel: string | null;
  rating: string;
  approved: boolean;
  isSelf: boolean;
};

export type LinesheetStanding = {
  versions: LinesheetVersion[];
  /** The profile to open for "the approved version", or null when none is approved. */
  approvedStyleId: string | null;
};

/** Pick the profile that stands for "approved" — the self style first, else any. */
export function pickApprovedStyleId(versions: LinesheetVersion[]): string | null {
  const self = versions.find((v) => v.isSelf && v.approved);
  if (self) return self.styleId;
  const any = versions.find((v) => v.approved);
  return any ? any.styleId : null;
}

// Grouping the assortment by colour (Tess: "would want the option to group by
// color and or show multiple colors as well"). There is no hex on a style, so a
// colour is a name — the colorway captions when there are any, otherwise the
// free-text `colors` line split on / and , . A style with several colours lands
// in each of their groups, which is also how "show multiple colors" reads on the
// page: the same style appears once per colour, under its own swatch.

const UNSORTED_COLOR = "Unsorted";

/** De-duplicate names case-insensitively, keeping first-seen order and casing. */
function dedupeNames(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of raw) {
    const k = n.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n.trim());
  }
  return out;
}

/** The style's own colours — colorway captions when there are any, else the
 *  free-text line split on / and , . Ignores any per-sheet override. */
export function baseColorNames(e: LinesheetEntry): string[] {
  const fromWays = e.colorways.map((c) => c.name).filter(Boolean);
  const raw = fromWays.length
    ? fromWays
    : (e.colors ?? "").split(/[/,]/).map((s) => s.trim()).filter(Boolean);
  return dedupeNames(raw);
}

/** The colour names shown for an entry: the per-sheet override when set (even an
 *  empty one — "no colours here"), otherwise the style's own colours. */
export function entryColorNames(e: LinesheetEntry): string[] {
  return e.colorOverride ? e.colorOverride.map((c) => c.name) : baseColorNames(e);
}

/** A valid #rgb / #rrggbb string, lower-cased, or null. */
function cleanHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s) ? s : null;
}

/**
 * Read a stored/edited colour list into clean {name, hex} entries, de-duplicated
 * by name (case-insensitive) and capped. Tolerates the earlier plain-string shape
 * so an older linesheet's colours still load.
 */
function normalizeColorList(raw: unknown[]): LinesheetColorName[] {
  const seen = new Set<string>();
  const out: LinesheetColorName[] = [];
  for (const el of raw) {
    let name = "";
    let hex: string | null = null;
    if (typeof el === "string") {
      name = el.trim();
    } else if (el && typeof el === "object") {
      const r = el as Record<string, unknown>;
      name = typeof r.name === "string" ? r.name.trim() : "";
      hex = cleanHex(r.hex);
    }
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: name.slice(0, 40), hex });
    if (out.length >= MAX_COLORS) break;
  }
  return out;
}

export type ColorGroup = { color: string; entries: LinesheetEntry[] };

/**
 * Group entries by colour name, in first-seen order, with any colourless style
 * gathered under "Unsorted" at the end. A multi-colour style appears in each of
 * its groups.
 */
export function groupByColor(entries: LinesheetEntry[]): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();
  const order: string[] = [];
  const add = (key: string, display: string, e: LinesheetEntry) => {
    let g = groups.get(key);
    if (!g) {
      g = { color: display, entries: [] };
      groups.set(key, g);
      order.push(key);
    }
    g.entries.push(e);
  };
  for (const e of entries) {
    const names = entryColorNames(e);
    if (names.length) for (const n of names) add(n.toLowerCase(), n, e);
    else add(UNSORTED_COLOR.toLowerCase(), UNSORTED_COLOR, e);
  }
  // Unsorted trails the real colours.
  return order
    .map((k) => groups.get(k) as ColorGroup)
    .sort((a, b) =>
      a.color === UNSORTED_COLOR ? 1 : b.color === UNSORTED_COLOR ? -1 : 0
    );
}

/** The image to show for a style within a colour group — that colourway, else its sketch. */
export function swatchForColor(e: LinesheetEntry, color: string): string | null {
  const hit = e.colorways.find((c) => c.name.toLowerCase() === color.toLowerCase());
  return hit?.url ?? e.sketchUrl;
}

function t(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

function dots(parts: (string | null | undefined)[]): string {
  return parts.map(t).filter(Boolean).join(" · ");
}

/** Any input becomes one of the two kinds; unknown reads as seasonal. */
export function normalizeKind(raw: unknown): LinesheetKind {
  return raw === "evergreen" ? "evergreen" : "seasonal";
}

export function kindLabel(kind: LinesheetKind): string {
  return kind === "evergreen" ? "Evergreen" : "Seasonal";
}

// A generous ceiling so a runaway write cannot bloat a row, well above any real
// linesheet.
const MAX_ITEMS = 500;
// Well above any real colour count on a single style.
const MAX_COLORS = 24;

/** Read whatever is stored into a clean, de-duplicated, ordered item list. */
export function normalizeItems(raw: unknown): LinesheetItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LinesheetItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const styleId = typeof r.style_id === "string" ? r.style_id.trim() : "";
    if (!styleId || seen.has(styleId)) continue;
    seen.add(styleId);
    const item: LinesheetItem = { style_id: styleId };
    if (typeof r.price === "string" && r.price.trim()) item.price = r.price.trim().slice(0, 40);
    if (typeof r.note === "string" && r.note.trim()) item.note = r.note.trim().slice(0, 2000);
    if (typeof r.delivery === "string" && r.delivery.trim()) item.delivery = r.delivery.trim().slice(0, 60);
    if (typeof r.sizes === "string" && r.sizes.trim()) item.sizes = r.sizes.trim().slice(0, 60);
    if (Array.isArray(r.colorways)) {
      const cw = r.colorways.filter((x): x is string => typeof x === "string" && x.length > 0);
      if (cw.length) item.colorways = cw;
    }
    // A present colours key is an override — kept even when empty ("no colours on
    // this sheet"). Absent means fall back to the style's own colours.
    if (Array.isArray(r.colors)) {
      item.colors = normalizeColorList(r.colors);
    }
    out.push(item);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Append styles not already present, keeping existing order and settings. */
export function addItems(items: LinesheetItem[], styleIds: string[]): LinesheetItem[] {
  const have = new Set(items.map((i) => i.style_id));
  const next = [...items];
  for (const raw of styleIds) {
    const id = (raw ?? "").trim();
    if (id && !have.has(id)) {
      have.add(id);
      next.push({ style_id: id });
    }
  }
  return next;
}

export function removeItem(items: LinesheetItem[], styleId: string): LinesheetItem[] {
  return items.filter((i) => i.style_id !== styleId);
}

/**
 * Reorder to match `orderedIds`. Ids not present are ignored; items whose id is
 * not named keep their relative order and trail the named ones — a partial order
 * never drops a style off the sheet.
 */
export function reorderItems(items: LinesheetItem[], orderedIds: string[]): LinesheetItem[] {
  const byId = new Map(items.map((i) => [i.style_id, i] as const));
  const out: LinesheetItem[] = [];
  for (const id of orderedIds) {
    const it = byId.get(id);
    if (it) {
      out.push(it);
      byId.delete(id);
    }
  }
  for (const it of items) if (byId.has(it.style_id)) out.push(it);
  return out;
}

/** Set or clear a per-item price/note; a blank value removes the key. */
export function setItemField(
  items: LinesheetItem[],
  styleId: string,
  patch: {
    price?: string | null;
    note?: string | null;
    delivery?: string | null;
    sizes?: string | null;
  }
): LinesheetItem[] {
  return items.map((i) => {
    if (i.style_id !== styleId) return i;
    const next: LinesheetItem = { ...i };
    if ("price" in patch) {
      const p = t(patch.price);
      if (p) next.price = p.slice(0, 40);
      else delete next.price;
    }
    if ("note" in patch) {
      const n = t(patch.note);
      if (n) next.note = n.slice(0, 2000);
      else delete next.note;
    }
    if ("delivery" in patch) {
      const d = t(patch.delivery);
      if (d) next.delivery = d.slice(0, 60);
      else delete next.delivery;
    }
    if ("sizes" in patch) {
      const z = t(patch.sizes);
      if (z) next.sizes = z.slice(0, 60);
      else delete next.sizes;
    }
    return next;
  });
}

/**
 * Set a style's per-sheet colour list (names), de-duplicated and capped. Always
 * writes an explicit list — an empty one is the "no colours here" override, which
 * is why this does not delete the key the way a blank price does.
 */
export function setItemColors(
  items: LinesheetItem[],
  styleId: string,
  colors: LinesheetColorName[]
): LinesheetItem[] {
  const clean = normalizeColorList(colors ?? []);
  return items.map((i) => (i.style_id === styleId ? { ...i, colors: clean } : i));
}

export function buildEntry(input: LinesheetEntryInput): LinesheetEntry {
  const colorways = (input.colorways ?? []).filter((c) => c && t(c.url));
  const sketchUrl = t(input.sketchUrl);
  return {
    styleId: input.styleId,
    name: t(input.name) ?? "Untitled style",
    styleNo: t(input.styleNo),
    garment: t(input.garment),
    subtitle: dots([input.garment, input.season]),
    price: t(input.price),
    fabric: t(input.fabric),
    colors: t(input.colors),
    colorOverride: input.colorOverride ?? null,
    colorways: colorways.map((c) => ({ url: c.url, name: t(c.name) ?? "" })),
    sketchUrl,
    backUrl: t(input.backUrl),
    modelUrl: t(input.modelUrl),
    roundLabel: t(input.roundLabel),
    factory: t(input.factory),
    rating: (input.rating ?? "").trim(),
    note: t(input.note),
    delivery: t(input.delivery),
    sizes: t(input.sizes),
    // A style with no drawing and no colorway photo still lists (its name, price
    // and colours read fine) — the flag just lets a view show a placeholder
    // rather than a blank tile.
    empty: !sketchUrl && colorways.length === 0,
  };
}

export function buildLinesheet(
  opts: { name: string; kind: LinesheetKind; subtitle?: string | null; layout?: unknown },
  inputs: LinesheetEntryInput[]
): Linesheet {
  const entries = inputs.map(buildEntry);
  return {
    name: t(opts.name) ?? "Untitled linesheet",
    kind: opts.kind,
    kindLabel: kindLabel(opts.kind),
    subtitle: t(opts.subtitle),
    layout: normalizeLayout(opts.layout),
    entries,
    count: entries.length,
  };
}
