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

// One entry in a linesheet's ordered contents. `style_id` is the only required
// part; a linesheet carries the merchandising facts the style row does not —
// `price` (Estimated Retail; styles have no price column) and `note` (the
// positioning line the paper linesheet prints) — plus, later, which `colorways`
// to show.
export type LinesheetItem = {
  style_id: string;
  price?: string;
  note?: string;
  colorways?: string[];
};

/** A colour on an entry: the colorway image and its name (its caption). */
export type LinesheetColor = { url: string; name: string };

/** One style, resolved for display. */
export type LinesheetEntry = {
  styleId: string;
  name: string;
  styleNo: string | null;
  garment: string | null;
  /** style no · garment · season — the identifying line under the name. */
  subtitle: string;
  price: string | null;
  fabric: string | null;
  /** The free-text colours line, used when there are no colorway images. */
  colors: string | null;
  colorways: LinesheetColor[];
  sketchUrl: string | null;
  backUrl: string | null;
  roundLabel: string | null;
  factory: string | null;
  /** "" | "good" | "workable" | "poor" — drives the rating dot; "" draws none. */
  rating: string;
  /** Per-item positioning note. */
  note: string | null;
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
  colorways?: LinesheetColor[];
  sketchUrl?: string | null;
  backUrl?: string | null;
  roundLabel?: string | null;
  factory?: string | null;
  rating?: string | null;
  note?: string | null;
};

export type Linesheet = {
  name: string;
  kind: LinesheetKind;
  kindLabel: string;
  season: string | null;
  entries: LinesheetEntry[];
  count: number;
};

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
    if (Array.isArray(r.colorways)) {
      const cw = r.colorways.filter((x): x is string => typeof x === "string" && x.length > 0);
      if (cw.length) item.colorways = cw;
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
  patch: { price?: string | null; note?: string | null }
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
    return next;
  });
}

export function buildEntry(input: LinesheetEntryInput): LinesheetEntry {
  const colorways = (input.colorways ?? []).filter((c) => c && t(c.url));
  const sketchUrl = t(input.sketchUrl);
  return {
    styleId: input.styleId,
    name: t(input.name) ?? "Untitled style",
    styleNo: t(input.styleNo),
    garment: t(input.garment),
    subtitle: dots([input.styleNo, input.garment, input.season]),
    price: t(input.price),
    fabric: t(input.fabric),
    colors: t(input.colors),
    colorways: colorways.map((c) => ({ url: c.url, name: t(c.name) ?? "" })),
    sketchUrl,
    backUrl: t(input.backUrl),
    roundLabel: t(input.roundLabel),
    factory: t(input.factory),
    rating: (input.rating ?? "").trim(),
    note: t(input.note),
    // A style with no drawing and no colorway photo still lists (its name, price
    // and colours read fine) — the flag just lets a view show a placeholder
    // rather than a blank tile.
    empty: !sketchUrl && colorways.length === 0,
  };
}

export function buildLinesheet(
  opts: { name: string; kind: LinesheetKind; season?: string | null },
  inputs: LinesheetEntryInput[]
): Linesheet {
  const entries = inputs.map(buildEntry);
  return {
    name: t(opts.name) ?? "Untitled linesheet",
    kind: opts.kind,
    kindLabel: kindLabel(opts.kind),
    season: t(opts.season),
    entries,
    count: entries.length,
  };
}
