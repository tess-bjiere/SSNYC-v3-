// A material order — a purchase order assembled from the fabric & trim library
// (Tess, 2026-08-18: "add ability to create an order for materials from the
// material library"). You pick materials in the library, set a quantity and unit
// per line, and the order groups them by supplier so each supplier's portion can
// be sent as its own page.
//
// Pure and dependency-free like the rest of lib/. It owns the stored shape (the
// ordered `items` list and the edits done to it — add, remove, set a line's
// quantity/unit/note) and the render model the page lays out (lines grouped by
// supplier). The database read and the material resolution live in the page, the
// same division the linesheet uses. Both halves are unit-tested here.

export type OrderStatus = "draft" | "sent" | "received";

export const ORDER_STATUSES: { key: OrderStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "received", label: "Received" },
];

export function normalizeStatus(raw: unknown): OrderStatus {
  return raw === "sent" || raw === "received" ? raw : "draft";
}

export function statusLabel(s: OrderStatus): string {
  return ORDER_STATUSES.find((x) => x.key === s)?.label ?? "Draft";
}

// One line of an order. `material_id` is the only required part — the material
// row carries what the thing IS (name, supplier, price); the line carries what
// this order asks for: how much (`qty`), in what unit (`unit`, e.g. m / yd / pcs
// / rolls), and a per-line `note` (a colourway to dye to, a cut length).
export type OrderLine = {
  material_id: string;
  qty?: string;
  unit?: string;
  note?: string;
};

// The units an order line offers — a small, editable default set. Fabric is
// usually ordered by length, trim by the piece; the field is free text on write
// so anything outside this list still saves.
export const ORDER_UNITS = ["m", "yd", "pcs", "rolls", "cones", "kg"] as const;

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** Read the stored jsonb into clean, de-duplicated lines, order preserved. A row
 *  missing its material_id, or a second line for a material already listed, is
 *  dropped — a material appears at most once in an order. */
export function normalizeItems(raw: unknown): OrderLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: OrderLine[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const id = str((r as Record<string, unknown>).material_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      material_id: id,
      qty: str((r as Record<string, unknown>).qty),
      unit: str((r as Record<string, unknown>).unit),
      note: str((r as Record<string, unknown>).note),
    });
  }
  return out;
}

/** Append materials not already on the order, in the given order, at the end.
 *  Ones already present are left untouched (their quantities are not reset). */
export function addItems(items: OrderLine[], materialIds: string[]): OrderLine[] {
  const have = new Set(items.map((i) => i.material_id));
  const next = [...items];
  for (const id of materialIds) {
    const clean = str(id);
    if (clean && !have.has(clean)) {
      have.add(clean);
      next.push({ material_id: clean });
    }
  }
  return next;
}

export function removeItem(items: OrderLine[], materialId: string): OrderLine[] {
  return items.filter((i) => i.material_id !== materialId);
}

/** Set a line's quantity / unit / note. An empty string clears that field. Only
 *  the keys present in `patch` are touched; a material not on the order is a
 *  no-op. */
export function setItemField(
  items: OrderLine[],
  materialId: string,
  patch: { qty?: string | null; unit?: string | null; note?: string | null }
): OrderLine[] {
  return items.map((i) => {
    if (i.material_id !== materialId) return i;
    const next: OrderLine = { ...i };
    for (const k of ["qty", "unit", "note"] as const) {
      if (k in patch) {
        const v = patch[k];
        if (v == null || v.trim() === "") delete next[k];
        else next[k] = v.trim();
      }
    }
    return next;
  });
}

// --- The render model ---

/** The material facts a line needs to render, resolved by the page. */
export type OrderEntryInput = {
  materialId: string;
  name: string;
  kind: string | null;
  supplier: string | null;
  supplierRef: string | null;
  composition: string | null;
  color: string | null;
  price: string | null;
  moq: string | null;
  leadTime: string | null;
  thumb: string | null;
  qty: string | null;
  unit: string | null;
  note: string | null;
};

export type OrderEntry = OrderEntryInput;

/** One supplier's lines. Materials with no supplier collect under a single
 *  labelled bucket that always sorts last. */
export type OrderGroup = {
  supplier: string;
  /** True for the no-supplier bucket — the page can style/label it differently. */
  unassigned: boolean;
  entries: OrderEntry[];
};

export const NO_SUPPLIER_LABEL = "No supplier";

export type Order = {
  name: string;
  status: OrderStatus;
  statusLabel: string;
  groups: OrderGroup[];
  /** Total number of lines across every supplier. */
  count: number;
  /** How many distinct suppliers (the no-supplier bucket counts as one). */
  supplierCount: number;
};

/**
 * Build the ordered, supplier-grouped render model. Line order within a supplier
 * follows the stored order; suppliers are sorted alphabetically with the
 * no-supplier bucket forced last. A line whose material could not be resolved
 * (deleted since it was added) is simply left out.
 */
export function buildOrder(
  meta: { name: string; status: OrderStatus },
  inputs: OrderEntryInput[]
): Order {
  const groups = new Map<string, OrderEntry[]>();
  for (const e of inputs) {
    const key = (e.supplier ?? "").trim() || NO_SUPPLIER_LABEL;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  const ordered: OrderGroup[] = Array.from(groups.entries())
    .map(([supplier, entries]) => ({
      supplier,
      unassigned: supplier === NO_SUPPLIER_LABEL,
      entries,
    }))
    .sort((a, b) => {
      if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
      return a.supplier.localeCompare(b.supplier);
    });

  return {
    name: meta.name,
    status: meta.status,
    statusLabel: statusLabel(meta.status),
    groups: ordered,
    count: inputs.length,
    supplierCount: ordered.length,
  };
}

/** A short "3 lines · 2 suppliers" caption for a list row. */
export function orderSummary(count: number, supplierCount: number): string {
  const l = `${count} ${count === 1 ? "line" : "lines"}`;
  if (count === 0) return "Empty";
  const s = `${supplierCount} ${supplierCount === 1 ? "supplier" : "suppliers"}`;
  return `${l} · ${s}`;
}
