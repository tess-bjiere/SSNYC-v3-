"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Select from "@/app/components/Select";
import MultiSelect from "@/app/components/MultiSelect";
import {
  fieldsFor,
  specLine,
  matchMaterial,
  distinct,
  kindOf,
  kindLabel,
  kindLabelPlural,
  materialGarments,
  gsmLabel,
  sourcingOf,
  sourcingLabel,
  constructionClass,
  isArchived,
  inProduction,
  type MaterialKind,
  type Sourcing,
  type FabricClass,
} from "@/lib/materials";
import {
  createMaterial,
  updateMaterial,
  addMaterialImages,
  softDeleteMaterial,
  setMaterialArchived,
} from "@/app/actions/materials";
import { createOrder, addMaterialsToOrder } from "@/app/actions/materialOrders";

export type OpenOrder = { id: string; name: string; status: string };
// A product the brand sells (a style), with its garment type — the options for
// "used for" and the garment-type filter.
export type Product = { name: string; type: string | null };

export type Material = {
  id: string;
  brand: string;
  kind: string;
  name: string;
  supplier: string | null;
  supplier_ref: string | null;
  composition: string | null;
  color: string | null;
  color_hex: string | null;
  weight: string | null;
  width: string | null;
  construction: string | null;
  finish: string | null;
  trim_type: string | null;
  size: string | null;
  material: string | null;
  pack_type: string | null;
  price: string | null;
  moq: string | null;
  lead_time: string | null;
  notes: string | null;
  sourcing: string | null;
  archived: boolean | null;
  current_production: boolean | null;
  image_url: string | null;
  thumb_url: string | null;
  extra_images: unknown;
  garments: unknown;
};

// A small segmented Stock / Custom control — click a chosen side again to clear.
function SourcingPick({
  value,
  onChange,
}: {
  value: Sourcing | "";
  onChange: (v: Sourcing | "") => void;
}) {
  return (
    <div className="pg-filters" style={{ marginTop: 0 }}>
      {(["stock", "custom"] as Sourcing[]).map((s) => (
        <button
          key={s}
          type="button"
          className={"pg-filter" + (value === s ? " on" : "")}
          aria-pressed={value === s}
          onClick={() => onChange(value === s ? "" : s)}
        >
          {sourcingLabel(s)}
        </button>
      ))}
    </div>
  );
}

// A rendered result group: an optional header, and one or more sub-sections
// (the fabric-type sort nests content types under Knit / Woven).
type Sub = { key: string; header: string | null; items: Material[] };
type Group = { key: string; header: string | null; count: number; subs: Sub[] };

function cover(m: Material): string {
  return m.thumb_url || m.image_url || "";
}
function extraUrls(m: Material): string[] {
  const a = m.extra_images;
  if (!Array.isArray(a)) return [];
  return a
    .map((e) => (typeof e === "string" ? e : e && typeof e === "object" ? (e as { image_url?: string }).image_url ?? "" : ""))
    .filter(Boolean);
}

// The fabric & trim library (Tess, 2026-08-18). A grid of swatch cards, told
// apart by kind, with search, a supplier filter, add and edit. Modelled on the
// References library; a material's fields are its spec, not a garment's.
export default function MaterialsClient({
  materials,
  canEdit = false,
  openOrders = [],
  products = [],
}: {
  materials: Material[];
  canEdit?: boolean;
  openOrders?: OpenOrder[];
  products?: Product[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<MaterialKind>("fabric");
  const [q, setQ] = useState("");
  const [supplier, setSupplier] = useState("");
  // Filter by which product a material is used for, and by garment type. A
  // material's type is derived from its products via the styles list (Tess,
  // 2026-08-19: "filtered by garment type and fabric type").
  const [productF, setProductF] = useState<string[]>([]);
  const [typeF, setTypeF] = useState<string[]>([]);
  // Custom / stock filter (Tess, 2026-08-19). "" = either.
  const [sourcingF, setSourcingF] = useState<Sourcing | "">("");
  // Archived are hidden by default; the toggle shows the archived ones instead
  // (Tess, 2026-08-19: "archive a fabric or a trim or packaging item").
  const [showArchived, setShowArchived] = useState(false);
  // Sort order (Tess, 2026-08-19: "add ability to sort by garment type or fabric
  // type"). Default keeps the newest-first order the page loads in. A sort other
  // than newest/name also groups the grid under labelled headers.
  const [sort, setSort] = useState("newest");
  // Grid of swatches, or a compact list (Tess, 2026-08-19: "add list view").
  const [view, setView] = useState<"grid" | "list">("grid");
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Material | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Select mode — the way to build an order from the library (Tess, 2026-08-18:
  // "add ability to create an order for materials from the material library").
  // Off, the grid opens a swatch's detail; on, a click ticks it for an order.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function leaveSelect() {
    setSelecting(false);
    setSelected(new Set());
    setNaming(false);
  }

  async function createFromSelection(name: string) {
    const fd = new FormData();
    fd.set("name", name);
    for (const id of selected) fd.append("material_ids", id);
    // createOrder redirects to the new order on success.
    await createOrder(fd);
  }
  async function addSelectionToOrder(orderId: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const res = await addMaterialsToOrder(orderId, ids);
    leaveSelect();
    router.push(`/material-orders/${orderId}`);
    flash(res.added > 0 ? `Added ${res.added} to order` : "Already on the order");
  }

  // product name → garment type, for deriving a material's types from its
  // products and for building the garment-type filter options.
  const typeOf = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of products) m.set(p.name, p.type);
    return m;
  }, [products]);
  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.name, label: p.name })),
    [products]
  );
  const typeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.type) s.add(p.type);
    return Array.from(s).sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t }));
  }, [products]);

  // The garment types a material serves — its products mapped through the styles
  // list. Unknown products (renamed/removed styles) contribute no type.
  function typesOf(m: Material): string[] {
    const out = new Set<string>();
    for (const g of materialGarments(m)) {
      const t = typeOf.get(g);
      if (t) out.add(t);
    }
    return Array.from(out);
  }
  // The one garment type a material sorts under — the alphabetically-first of the
  // types it serves; none sorts last.
  function primaryGarmentType(m: Material): string {
    const ts = typesOf(m).sort((a, b) => a.localeCompare(b));
    return ts[0] ?? "";
  }

  const ofKind = useMemo(
    () => materials.filter((m) => kindOf(m) === kind),
    [materials, kind]
  );
  const suppliers = useMemo(() => distinct(ofKind, "supplier"), [ofKind]);

  const filtered = useMemo(
    () =>
      ofKind.filter((m) => {
        // Archived out of the default view; the toggle flips to archived-only.
        if (isArchived(m) !== showArchived) return false;
        if (!matchMaterial(m, q)) return false;
        if (supplier && (m.supplier ?? "") !== supplier) return false;
        if (sourcingF && sourcingOf(m) !== sourcingF) return false;
        if (productF.length) {
          const g = new Set(materialGarments(m));
          if (!productF.some((p) => g.has(p))) return false;
        }
        if (typeF.length) {
          const ts = new Set(typesOf(m));
          if (!typeF.some((t) => ts.has(t))) return false;
        }
        return true;
      }),
    // typesOf is derived from `products`/`typeOf`, captured via the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ofKind, q, supplier, sourcingF, showArchived, productF, typeF, typeOf]
  );

  // The sorted, grouped result. Newest and Name are flat (one unlabelled group);
  // the type sorts divide the swatches under headers (Tess, 2026-08-19: "the
  // results should show the swatches under labeled headers for how each is
  // divided up"). A group has one or two levels: garment/trim sorts head one
  // level; the fabric sort heads two — Knit / Woven / Other, then content type
  // within ("by knit content types and woven content types").
  const grouped = useMemo<Group[]>(() => {
    const byName = (a: Material, b: Material) => (a.name ?? "").localeCompare(b.name ?? "");
    const flat = (items: Material[]): Group[] => [
      { key: "all", header: null, count: items.length, subs: [{ key: "all", header: null, items }] },
    ];

    if (sort === "newest") return flat(filtered); // page order is newest-first
    if (sort === "name") return flat([...filtered].sort(byName));

    // Bucket into an ordered map, remembering first-seen order for ties.
    const bucket = (items: Material[], keyOf: (m: Material) => string) => {
      const map = new Map<string, Material[]>();
      for (const m of items) {
        const k = keyOf(m);
        const list = map.get(k);
        if (list) list.push(m);
        else map.set(k, [m]);
      }
      return map;
    };
    const BLANK = "￿"; // sorts last
    const sortKeys = (keys: string[]) =>
      keys.sort((a, b) => {
        if ((a === BLANK) !== (b === BLANK)) return a === BLANK ? 1 : -1;
        return a.localeCompare(b);
      });

    if (sort === "garment") {
      const map = bucket(filtered, (m) => primaryGarmentType(m) || BLANK);
      return sortKeys([...map.keys()]).map((k) => ({
        key: k,
        header: k === BLANK ? "No garment type" : k,
        count: map.get(k)!.length,
        subs: [{ key: k, header: null, items: map.get(k)!.sort(byName) }],
      }));
    }

    // sort === "type". Trim and packaging group by their own type field, one
    // level; fabric is the two-level knit/woven case below.
    if (kind === "trim" || kind === "packaging") {
      const typeField = kind === "trim" ? "trim_type" : "pack_type";
      const map = bucket(filtered, (m) => ((m[typeField] as string | null) ?? "").trim() || BLANK);
      return sortKeys([...map.keys()]).map((k) => ({
        key: k,
        header: k === BLANK ? "Other" : k,
        count: map.get(k)!.length,
        subs: [{ key: k, header: null, items: map.get(k)!.sort(byName) }],
      }));
    }

    // Fabric: Knit / Woven / Other, each subdivided by content (composition).
    const order: FabricClass[] = ["Knit", "Woven", "Other"];
    const top = bucket(filtered, (m) => constructionClass(m));
    const groups: Group[] = [];
    for (const cls of order) {
      const items = top.get(cls);
      if (!items || !items.length) continue;
      const sub = bucket(items, (m) => (m.composition ?? "").trim() || BLANK);
      groups.push({
        key: cls,
        header: cls,
        count: items.length,
        subs: sortKeys([...sub.keys()]).map((sk) => ({
          key: cls + "|" + sk,
          header: sk === BLANK ? "Unspecified content" : sk,
          items: sub.get(sk)!.sort(byName),
        })),
      });
    }
    return groups;
    // helpers derive from products/typeOf, captured via the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, kind, typeOf]);

  // One swatch as a grid card. Click opens it, or ticks it in select mode.
  function swatchCard(m: Material) {
    const src = cover(m);
    const n = extraUrls(m).length + (src ? 1 : 0);
    const isSel = selected.has(m.id);
    const gl = materialGarments(m);
    const gsm = gsmLabel(m.weight);
    const sc = sourcingOf(m);
    return (
      <div
        className={"card lib-card mat-card" + (selecting ? " mat-selectable" : "") + (isSel ? " mat-selected" : "")}
        key={m.id}
        onClick={() => (selecting ? toggleSelect(m.id) : setDetail(m))}
      >
        <div className="imgwrap">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={m.name} loading="lazy" />
          ) : (
            <div className="mat-noimg">
              {m.color_hex && <span className="mat-chip" style={{ background: m.color_hex }} />}
              No swatch
            </div>
          )}
          {selecting && <span className="mat-check">{isSel ? "✓" : ""}</span>}
          {/* Current-production is the operational flag, so it rides ON the
              swatch (Tess, 2026-08-19: "'current production' fabric ... should
              appear on thumbnail"). Custom/stock moved off the image to a chip by
              the name — that reorg keeps the swatch from crowding as flags grow
              (Tess: "if thumbnails are getting too crowded -- reorganize"). */}
          {!selecting && inProduction(m) && (
            <span className="mat-badge prod">In production</span>
          )}
          {n > 1 && <span className="card-extra">{n}</span>}
        </div>
        <div className="meta">
          <div className="d">
            <span className="mat-dname">{m.name}</span>
            {sc && <span className={"mat-ibadge " + sc}>{sourcingLabel(sc)}</span>}
          </div>
          {/* Colour and GSM, up front on the thumbnail (Tess, 2026-08-19: "also
              list color on and gsm on thumbnail"). */}
          {(m.color || gsm) && (
            <div className="mat-facts">
              {m.color && (
                <span className="mat-colorbit">
                  {m.color_hex && <span className="mat-dot" style={{ background: m.color_hex }} />}
                  {m.color}
                </span>
              )}
              {gsm && <span className="mat-gsm">{gsm}</span>}
            </div>
          )}
          {specLine(m) && <div className="s">{specLine(m)}</div>}
          {gl.length > 0 && (
            <div className="mat-tags">
              {gl.slice(0, 3).map((g) => (
                <span className="mat-tag" key={g}>{g}</span>
              ))}
              {gl.length > 3 && <span className="mat-tag mat-tag-more">+{gl.length - 3}</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // The same swatch as a compact list row — thumb, name + spec, colour/GSM, tags.
  function swatchRow(m: Material) {
    const src = cover(m);
    const isSel = selected.has(m.id);
    const gl = materialGarments(m);
    const gsm = gsmLabel(m.weight);
    const sc = sourcingOf(m);
    return (
      <div
        className={"mat-lrow" + (selecting ? " mat-selectable" : "") + (isSel ? " mat-selected" : "")}
        key={m.id}
        onClick={() => (selecting ? toggleSelect(m.id) : setDetail(m))}
      >
        <div className="mat-lthumb">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={m.name} loading="lazy" />
          ) : (
            <span className="mat-lnoimg">
              {m.color_hex && <span className="mat-dot" style={{ background: m.color_hex }} />}
            </span>
          )}
          {selecting && <span className="mat-check">{isSel ? "✓" : ""}</span>}
        </div>
        <div className="mat-lmain">
          <div className="mat-lname">
            {m.name}
            {inProduction(m) && <span className="mat-ibadge prod">In production</span>}
            {sc && <span className={"mat-ibadge " + sc}>{sourcingLabel(sc)}</span>}
          </div>
          {specLine(m) && <div className="mat-lspec">{specLine(m)}</div>}
        </div>
        <div className="mat-lfacts">
          {m.color && (
            <span className="mat-colorbit">
              {m.color_hex && <span className="mat-dot" style={{ background: m.color_hex }} />}
              {m.color}
            </span>
          )}
          {gsm && <span className="mat-gsm">{gsm}</span>}
        </div>
        {gl.length > 0 && (
          <div className="mat-tags mat-ltags">
            {gl.slice(0, 4).map((g) => (
              <span className="mat-tag" key={g}>{g}</span>
            ))}
            {gl.length > 4 && <span className="mat-tag mat-tag-more">+{gl.length - 4}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page lib-page">
      <div className="page-head">
        <h1 className="page-title display">Materials</h1>
        <div className="spacer" />
        {/* Grid ⇄ list (Tess, 2026-08-19: "add list view"). */}
        <div className="mat-viewtoggle" role="group" aria-label="View">
          <button
            type="button"
            className={"mat-vt" + (view === "grid" ? " on" : "")}
            aria-pressed={view === "grid"}
            title="Grid"
            onClick={() => setView("grid")}
          >
            ▦
          </button>
          <button
            type="button"
            className={"mat-vt" + (view === "list" ? " on" : "")}
            aria-pressed={view === "list"}
            title="List"
            onClick={() => setView("list")}
          >
            ☰
          </button>
        </div>
        {canEdit && selecting && (
          <button type="button" className="btn ghost sm" onClick={leaveSelect}>
            Cancel
          </button>
        )}
        {canEdit && !selecting && (
          <button type="button" className="btn ghost sm" onClick={() => setSelecting(true)}>
            Select for order
          </button>
        )}
        {canEdit && !selecting && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Add {kindLabel(kind).toLowerCase()}
          </button>
        )}
      </div>

      {/* Fabric / Trim / Packaging — three libraries in one, told apart by kind
          (Tess, 2026-08-19: "add packaging tab to fabric and trims"). */}
      <div className="pg-filters">
        {(["fabric", "trim", "packaging"] as MaterialKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className={"pg-filter" + (kind === k ? " on" : "")}
            aria-pressed={kind === k}
            onClick={() => { setKind(k); setSupplier(""); }}
          >
            {kindLabelPlural(k)}
          </button>
        ))}
      </div>

      <div className="lib-bar">
        <input
          className="input lib-search"
          placeholder={`Search ${kindLabelPlural(kind).toLowerCase()} — name, composition, supplier…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          className="select sm lib-sort"
          aria-label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "name", label: "Name A–Z" },
            // Garment type is only meaningful once products carry types.
            ...(typeOptions.length > 0 ? [{ value: "garment", label: "Garment type" }] : []),
            { value: "type", label: `${kindLabel(kind)} type` },
          ]}
        />
        {suppliers.length > 0 && (
          <Select
            className="select sm lib-sort"
            aria-label="Supplier"
            value={supplier}
            onChange={setSupplier}
            options={[{ value: "", label: "All suppliers" }, ...suppliers.map((s) => ({ value: s, label: s }))]}
          />
        )}
        <Select
          className="select sm lib-sort"
          aria-label="Custom or stock"
          value={sourcingF}
          onChange={(v) => setSourcingF(v as Sourcing | "")}
          options={[
            { value: "", label: "Stock & custom" },
            { value: "stock", label: "Stock" },
            { value: "custom", label: "Custom" },
          ]}
        />
        <button
          type="button"
          className={"btn ghost sm" + (showArchived ? " on" : "")}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((v) => !v)}
          title="Show archived materials"
        >
          Archived
        </button>
        {typeOptions.length > 0 && (
          <MultiSelect
            className="select sm lib-sort"
            aria-label="Garment type"
            placeholder="All garment types"
            allLabel="types"
            values={typeF}
            onChange={setTypeF}
            options={typeOptions}
          />
        )}
        {productOptions.length > 0 && (
          <MultiSelect
            className="select sm lib-sort"
            aria-label="Product"
            placeholder="All products"
            allLabel="products"
            values={productF}
            onChange={setProductF}
            options={productOptions}
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {ofKind.length === 0
            ? `No ${kindLabelPlural(kind).toLowerCase()} yet.${canEdit ? ` Add one with the button above.` : ""}`
            : `No ${kindLabelPlural(kind).toLowerCase()} match those filters.`}
        </div>
      ) : (
        grouped.map((g) => (
          <section className="mat-group" key={g.key}>
            {g.header && (
              <h2 className="mat-group-h">
                {g.header}
                <span className="mat-group-n">{g.count}</span>
              </h2>
            )}
            {g.subs.map((sub) => (
              <div className="mat-sub" key={sub.key}>
                {sub.header && <h3 className="mat-sub-h">{sub.header}</h3>}
                {view === "list" ? (
                  <div className="mat-list">{sub.items.map(swatchRow)}</div>
                ) : (
                  <div className="grid dens-md">{sub.items.map(swatchCard)}</div>
                )}
              </div>
            ))}
          </section>
        ))
      )}

      {/* The order pickbar — appears while selecting, once at least one swatch is
          ticked. Create a new order (named), or drop the selection into an open
          one. */}
      {selecting && selected.size > 0 && (
        <div className="mo-pickbar">
          <span className="mo-pickbar-n">
            {selected.size} selected
          </span>
          <div className="spacer" />
          {openOrders.length > 0 && (
            <Select
              className="select sm mo-pickbar-add"
              aria-label="Add to order"
              value=""
              onChange={(v) => v && addSelectionToOrder(v)}
              options={[
                { value: "", label: "Add to order…" },
                ...openOrders.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          )}
          <button type="button" className="btn" onClick={() => setNaming(true)}>
            Create order
          </button>
        </div>
      )}

      {naming && (
        <NameOrder
          count={selected.size}
          onClose={() => setNaming(false)}
          onCreate={createFromSelection}
        />
      )}

      {adding && (
        <MaterialForm
          kind={kind}
          products={products}
          onClose={() => setAdding(false)}
          onDone={(k) => { setAdding(false); flash(`Added ${kindLabel(k).toLowerCase()}`); }}
        />
      )}

      {detail && (
        <MaterialDetail
          material={detail}
          canEdit={canEdit}
          products={products}
          onClose={() => setDetail(null)}
          onToast={flash}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// The add form — a new fabric or trim, with its kind-appropriate fields and one
// or more swatch photos.
function MaterialForm({
  kind,
  products,
  onClose,
  onDone,
}: {
  kind: MaterialKind;
  products: Product[];
  onClose: () => void;
  onDone: (k: MaterialKind) => void;
}) {
  const router = useRouter();
  const [k, setK] = useState<MaterialKind>(kind);
  const [garments, setGarments] = useState<string[]>([]);
  const [sourcing, setSourcing] = useState<Sourcing | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    fd.set("kind", k);
    fd.set("sourcing", sourcing);
    for (const g of garments) fd.append("garments", g);
    setBusy(true);
    setErr(null);
    try {
      const res = await createMaterial(fd);
      if (res.ok) {
        router.refresh();
        onDone(k);
      } else {
        setErr(res.errors[0] ?? "Could not save.");
      }
    } catch {
      setErr("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div className="modal mat-modal">
        <div className="modal-head">
          <span>Add {kindLabel(k).toLowerCase()}</span>
          <button className="notes-close" onClick={onClose} title="Close">×</button>
        </div>
        <form ref={formRef} className="modal-body mat-form" onSubmit={submit}>
          <div className="pg-filters" style={{ marginTop: 0 }}>
            {(["fabric", "trim", "packaging"] as MaterialKind[]).map((kk) => (
              <button
                key={kk}
                type="button"
                className={"pg-filter" + (k === kk ? " on" : "")}
                onClick={() => setK(kk)}
              >
                {kindLabel(kk)}
              </button>
            ))}
          </div>

          <label className="mat-field">
            <span className="mat-label">Name *</span>
            <input className="input" name="name" required autoFocus />
          </label>

          <div className="mat-field">
            <span className="mat-label">Custom or stock</span>
            <SourcingPick value={sourcing} onChange={setSourcing} />
          </div>

          <label className="mat-field mat-check-field">
            <input type="checkbox" name="current_production" />
            <span>Current production</span>
          </label>

          {fieldsFor(k).map((f) => (
            <label className="mat-field" key={f.key}>
              <span className="mat-label">{f.label}</span>
              <input className="input" name={f.key} />
            </label>
          ))}

          {products.length > 0 && (
            <div className="mat-field mat-field-wide">
              <span className="mat-label">Used for (products)</span>
              <MultiSelect
                className="select mat-garments"
                aria-label="Used for"
                placeholder="Pick products…"
                allLabel="products"
                values={garments}
                onChange={setGarments}
                options={products.map((p) => ({ value: p.name, label: p.name }))}
              />
            </div>
          )}

          <label className="mat-field mat-field-wide">
            <span className="mat-label">Notes</span>
            <textarea className="textarea" name="notes" rows={2} />
          </label>

          <label className="mat-field mat-field-wide">
            <span className="mat-label">Swatch images</span>
            <input className="input" type="file" name="files" accept="image/*" multiple />
          </label>

          {err && <div className="mat-err">{err}</div>}

          <div className="mat-tools">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="ph-link" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Name a new order built from the current selection, then create it (the server
// action redirects to the fresh order).
function NameOrder({
  count,
  onClose,
  onCreate,
}: {
  count: number;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await onCreate(n);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div className="modal mat-modal mat-modal-sm">
        <div className="modal-head">
          <span>New order · {count} {count === 1 ? "material" : "materials"}</span>
          <button className="notes-close" onClick={onClose} title="Close">×</button>
        </div>
        <form className="modal-body mat-form" onSubmit={submit}>
          <label className="mat-field mat-field-wide">
            <span className="mat-label">Order name</span>
            <input
              className="input"
              value={name}
              autoFocus
              placeholder="e.g. FW26 fabric buy"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="mat-tools">
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create order"}
            </button>
            <button type="button" className="ph-link" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// The detail view — the swatch(es), the full spec as an inline editor for the
// team, add-more-images, and a two-click remove.
function MaterialDetail({
  material,
  canEdit,
  products,
  onClose,
  onToast,
}: {
  material: Material;
  canEdit: boolean;
  products: Product[];
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const k: MaterialKind = kindOf(material);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = { name: material.name ?? "" };
    for (const f of fieldsFor(k)) d[f.key] = (material[f.key as keyof Material] as string | null) ?? "";
    d.notes = material.notes ?? "";
    d.sourcing = sourcingOf(material);
    d.current_production = inProduction(material) ? "true" : "";
    return d;
  });
  const [garments, setGarments] = useState<string[]>(() => materialGarments(material));
  const [arm, setArm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);

  const images = [cover(material), ...extraUrls(material)].filter(Boolean);

  function save() {
    if (!canEdit) return;
    start(async () => {
      await updateMaterial(material.id, draft, garments);
      router.refresh();
      onToast("Saved");
    });
  }
  async function addImages(list: FileList | null) {
    if (!canEdit) return;
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    setUploading(true);
    try {
      const res = await addMaterialImages(material.id, fd);
      if (res.ok) { router.refresh(); onToast("Images added"); onClose(); }
      else if (res.errors[0]) onToast(res.errors[0]);
    } finally {
      setUploading(false);
    }
  }
  function remove() {
    start(async () => {
      await softDeleteMaterial(material.id);
      router.refresh();
      onToast("Moved to Trash");
      onClose();
    });
  }
  const archived = isArchived(material);
  function toggleArchive() {
    start(async () => {
      await setMaterialArchived(material.id, !archived);
      router.refresh();
      onToast(archived ? "Unarchived" : "Archived");
      onClose();
    });
  }

  return (
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div className="modal mat-modal">
        <div className="modal-head">
          <span>{material.name} · {kindLabel(k)}</span>
          <button className="notes-close" onClick={onClose} title="Close">×</button>
        </div>
        <div className="modal-body">
          {images.length > 0 && (
            <div className="grid dens-md mat-images">
              {images.map((src, i) => (
                <div className="card lib-card" key={i}>
                  <div className="imgwrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={material.name} loading="lazy" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {canEdit ? (
            <div className="mat-form">
              <label className="mat-field">
                <span className="mat-label">Name</span>
                <input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </label>
              <div className="mat-field">
                <span className="mat-label">Custom or stock</span>
                <SourcingPick
                  value={(draft.sourcing as Sourcing | "") ?? ""}
                  onChange={(v) => setDraft((d) => ({ ...d, sourcing: v }))}
                />
              </div>
              <label className="mat-field mat-check-field">
                <input
                  type="checkbox"
                  checked={draft.current_production === "true"}
                  onChange={(e) => setDraft((d) => ({ ...d, current_production: e.target.checked ? "true" : "" }))}
                />
                <span>Current production</span>
              </label>
              {fieldsFor(k).map((f) => (
                <label className="mat-field" key={f.key}>
                  <span className="mat-label">{f.label}</span>
                  <input
                    className="input"
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
              {products.length > 0 && (
                <div className="mat-field mat-field-wide">
                  <span className="mat-label">Used for (products)</span>
                  <MultiSelect
                    className="select mat-garments"
                    aria-label="Used for"
                    placeholder="Pick products…"
                    allLabel="products"
                    values={garments}
                    onChange={setGarments}
                    options={products.map((p) => ({ value: p.name, label: p.name }))}
                  />
                </div>
              )}

              <label className="mat-field mat-field-wide">
                <span className="mat-label">Notes</span>
                <textarea
                  className="textarea"
                  rows={2}
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>

              <input ref={imgInput} type="file" accept="image/*" multiple hidden
                onChange={(e) => { addImages(e.target.files); e.currentTarget.value = ""; }} />

              <div className="mat-tools">
                <button type="button" className="btn" disabled={pending} onClick={save}>
                  {pending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn ghost sm" disabled={uploading} onClick={() => imgInput.current?.click()}>
                  {uploading ? "Uploading…" : "+ Add images"}
                </button>
                <button type="button" className="btn ghost sm" disabled={pending} onClick={toggleArchive}>
                  {archived ? "Unarchive" : "Archive"}
                </button>
                <span className="spacer" />
                <button
                  type="button"
                  className={"btn link" + (arm ? " arm" : "")}
                  disabled={pending}
                  onMouseLeave={() => setArm(false)}
                  onClick={() => (arm ? remove() : setArm(true))}
                >
                  {arm ? "Remove?" : "Remove"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mat-readfacts">
              {[{ key: "name", label: "Name" }, ...fieldsFor(k), { key: "notes", label: "Notes" }].map((f) => {
                const v = (material[f.key as keyof Material] as string | null) ?? "";
                return v ? (
                  <div className="pg-facts" key={f.key}>
                    <span className="k">{f.label}</span>
                    <div className="pg-fact-val">{v}</div>
                  </div>
                ) : null;
              })}
              {sourcingOf(material) && (
                <div className="pg-facts">
                  <span className="k">Sourcing</span>
                  <div className="pg-fact-val">{sourcingLabel(sourcingOf(material))}</div>
                </div>
              )}
              {garments.length > 0 && (
                <div className="pg-facts">
                  <span className="k">Used for</span>
                  <div className="pg-fact-val mat-tags">
                    {garments.map((g) => (
                      <span className="mat-tag" key={g}>{g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
