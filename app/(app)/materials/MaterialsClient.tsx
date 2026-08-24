"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "@/app/components/Select";
import MultiSelect from "@/app/components/MultiSelect";
import Lightbox from "@/app/components/Lightbox";
import ImageCropper, { type CropRect } from "@/app/components/ImageCropper";
import { downscaleImage } from "@/app/components/downscaleImage";
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
  removeMaterialImage,
  setMaterialCover,
  rotateMaterialImage,
  brightenMaterialImage,
  cropMaterialImage,
  softDeleteMaterial,
  setMaterialArchived,
} from "@/app/actions/materials";
import { createOrder, addMaterialsToOrder } from "@/app/actions/materialOrders";
// Colour standards (Tess, 2026-08-23: "can you create a color standard that
// lives in the tool for fred?") — FRED-only, but this file also renders on
// SSYNC, where `standards` always arrives as []. `lib/materials.ts` already
// exports a `specLine`, imported above; this file does not need colorStandards'
// own specLine, so there's nothing to alias here (see task-5's StandardClient
// for the collision when both are needed).
import {
  standardForMaterial,
  approvalFor,
  statusLabel,
  type ColorStandard,
} from "@/lib/colorStandards";
import { saveApproval, dropApproval } from "@/app/actions/colorStandards";

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
  background_color: string | null;
  print_color: string | null;
  pack_type: string | null;
  hs_code: string | null;
  price: string | null;
  moq: string | null;
  lead_time: string | null;
  ai_file: string | null;
  notes: string | null;
  supplier_notes: string | null;
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

// Accept images by type, and HEIC/HEIF by extension since iPhone photos often
// arrive with an empty MIME type (Tess, 2026-08-20: "broaden to accept heic").
// They're converted to JPEG server-side so they display everywhere.
const isImageish = (f: File) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name);
const IMAGE_ACCEPT = "image/*,.heic,.heif";

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
  canOrder = false,
  openOrders = [],
  products = [],
  standards = [],
}: {
  materials: Material[];
  canEdit?: boolean;
  // Ordering (select → create/add-to order) is FRED-only; off FRED the library
  // is documentation only (Tess, 2026-08-19).
  canOrder?: boolean;
  openOrders?: OpenOrder[];
  products?: Product[];
  // Colour standards (Tess, 2026-08-23). Empty on every deploy but FRED — the
  // page already reduced a missing table to [] via normalizeStandards, so an
  // empty list here just means "this deploy doesn't have the feature."
  standards?: ColorStandard[];
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
  // Colour-standard filter (Tess, 2026-08-23). Selected standard names, plus
  // the synthetic "No standard" option; empty = no filtering, same idiom as
  // productF/typeF. Stays empty and unused when `standards` is [] (SSYNC).
  const [stdF, setStdF] = useState<string[]>([]);
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

  // Deep link: /materials?m=<id> opens that material's detail, so the linked
  // chips on a style profile click straight through to the fabric/trim (Tess,
  // 2026-08-20: "you should be able to click into the material and trims list").
  // A ref makes it fire once — a later router.refresh must not reopen a modal the
  // user has closed.
  const searchParams = useSearchParams();
  const openId = searchParams.get("m");
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!openId || openedFor.current === openId) return;
    const m = materials.find((x) => x.id === openId);
    if (m) {
      setKind(kindOf(m)); // show the matching tab behind the modal
      setDetail(m);
    }
    openedFor.current = openId;
  }, [openId, materials]);

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

  // The standard claiming a material, once. `standards` is [] on every deploy
  // but FRED, so this is a no-op find over an empty array there.
  const stdFor = (id: string) => standardForMaterial(standards, id);
  const NO_STANDARD = "No standard";
  // Archived means "kept but out of the way" here, same as materials' own
  // Archive: an archived standard is not offered as a fresh choice, in the
  // filter or in the picker below, but a material already linked to one keeps
  // showing its chip (that lookup stays on the full `standards` list via
  // stdFor, not this filtered one) — hiding it there would make an assigned
  // material look unassigned.
  const activeStandards = useMemo(() => standards.filter((s) => !s.archived), [standards]);
  const standardOptions = useMemo(
    () => [...activeStandards.map((s) => ({ value: s.name, label: s.name })), { value: NO_STANDARD, label: NO_STANDARD }],
    [activeStandards]
  );
  // Selected is the set of names ticked in the Standard MultiSelect; empty = no
  // filtering, matching how the other filters in this bar behave.
  function matchesStandard(m: Material): boolean {
    if (!stdF.length) return true;
    const s = stdFor(m.id);
    return stdF.includes(s ? s.name : NO_STANDARD);
  }

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
        if (!matchesStandard(m)) return false;
        return true;
      }),
    // typesOf/matchesStandard are derived from `products`/`typeOf`/`standards`,
    // captured via the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ofKind, q, supplier, sourcingF, showArchived, productF, typeF, typeOf, stdF, standards]
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

  // Beside the name, never on the image — the thumbnail already carries the
  // sourcing chip and the in-production badge and was deliberately kept
  // uncrowded (Tess, 2026-08-19). Same `.mat-ibadge` the sourcing chip uses, so
  // nothing new goes onto the swatch. Returns null whenever there's no standard
  // claiming this material, which — on every deploy but FRED — is always,
  // since `standards` arrives empty.
  function standardChip(materialId: string) {
    const s = stdFor(materialId);
    if (!s) return null;
    const a = approvalFor(s, materialId);
    const suffix = a && a.status !== "pending" ? ` · ${statusLabel(a.status)}` : "";
    return <span className="mat-ibadge">{s.name}{suffix}</span>;
  }

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
            {standards.length > 0 && standardChip(m.id)}
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
            {standards.length > 0 && standardChip(m.id)}
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
        {canOrder && canEdit && selecting && (
          <button type="button" className="btn ghost sm" onClick={leaveSelect}>
            Cancel
          </button>
        )}
        {canOrder && canEdit && !selecting && (
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
        {/* Colour standard (Tess, 2026-08-23). standards is [] on every deploy
            but FRED, so this whole filter — not just an empty options list —
            is skipped there: no dangling label, no empty dropdown. */}
        {standards.length > 0 && (
          <MultiSelect
            className="select sm lib-sort"
            aria-label="Standard"
            placeholder="All standards"
            allLabel="standards"
            values={stdF}
            onChange={setStdF}
            options={standardOptions}
          />
        )}
        {/* Archived is a quiet text link off to the side, not a filter chip in
            the row (Tess, 2026-08-20: "archived can be a smaller text link that's
            not in the main menu"). */}
        <button
          type="button"
          className={"btn link sm mat-archived-link" + (showArchived ? " on" : "")}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "← Current materials" : "Archived"}
        </button>
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
          one. FRED only. */}
      {canOrder && selecting && selected.size > 0 && (
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
          standards={standards}
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
    const formEl = formRef.current!;
    // Pull the selected images out of the form. They are uploaded ONE PER REQUEST
    // — Next caps a Server Action body at 25 MB, and a handful of phone photos
    // sent together blow past it and fail before the action even runs (Tess,
    // 2026-08-20: "the extra images arent populating ... when i add"). So the row
    // is created with just the first image, and the rest are added afterwards,
    // each in its own request.
    const fileInput = formEl.querySelector<HTMLInputElement>('input[type="file"][name="files"]');
    const files = Array.from(fileInput?.files ?? []).filter(isImageish);
    const fd = new FormData(formEl);
    fd.set("kind", k);
    fd.set("sourcing", sourcing);
    for (const g of garments) fd.append("garments", g);
    fd.delete("files");
    // Shrink oversize photos in the browser first — a big camera JPEG would be
    // refused by the 25 MB request limit before the action ever ran (Tess,
    // 2026-08-20: "keeps saying the images are too big").
    if (files[0]) fd.append("files", await downscaleImage(files[0]));
    setBusy(true);
    setErr(null);
    try {
      const res = await createMaterial(fd);
      if (!res.ok) {
        setErr(res.errors[0] ?? "Could not save.");
        return;
      }
      // The rest of the images, one request each.
      for (const f of files.slice(1)) {
        const ifd = new FormData();
        ifd.append("files", await downscaleImage(f));
        try {
          await addMaterialImages(res.id!, ifd);
        } catch {
          /* one image failing shouldn't lose the material or the others */
        }
      }
      router.refresh();
      onDone(k);
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
            <span className="mat-label">Internal notes — never printed on orders</span>
            <textarea className="textarea" name="notes" rows={2} />
          </label>
          <label className="mat-field mat-field-wide">
            <span className="mat-label">Spec / instructions — prints on orders</span>
            <textarea className="textarea" name="supplier_notes" rows={2} />
          </label>

          <label className="mat-field mat-field-wide">
            <span className="mat-label">Swatch images</span>
            <input className="input" type="file" name="files" accept={IMAGE_ACCEPT} multiple />
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
  standards,
  onClose,
  onToast,
}: {
  material: Material;
  canEdit: boolean;
  products: Product[];
  // Colour standards (Tess, 2026-08-23). [] on every deploy but FRED.
  standards: ColorStandard[];
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const k: MaterialKind = kindOf(material);
  const [pending, start] = useTransition();
  // The standard currently claiming this material, if any — recomputed from
  // props each render so a save/drop below shows up immediately after refresh.
  const currentStd = standardForMaterial(standards, material.id);
  // Archived standards are not offered as a new choice, but if this material
  // is already linked to one that has since been archived, that standard stays
  // in the picker's own options so the Select still shows it selected rather
  // than falling back to blank (same "stays visible once linked" rule as the
  // chip and read-only fact below).
  const pickerStandards = standards.filter((s) => !s.archived || s.id === currentStd?.id);
  // Choosing a standard from the picker calls saveApproval on the new one;
  // choosing the blank option calls dropApproval on the current one. Moving
  // between two standards is both in sequence — drop the old, then save the
  // new — per task-6-brief.md.
  function changeStandard(newId: string) {
    if (!canEdit) return;
    const oldId = currentStd?.id ?? "";
    if (newId === oldId) return;
    start(async () => {
      if (oldId) await dropApproval(oldId, material.id);
      if (newId) await saveApproval(newId, material.id, {});
      router.refresh();
      onToast("Saved");
    });
  }
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
  // The material's images as a managed gallery — cover first (Tess, 2026-08-20:
  // "add multiple images to fabrics, trims and packaging profiles"). Local so an
  // add / delete / set-cover shows at once without closing the modal.
  const [imgs, setImgs] = useState<string[]>(() =>
    [cover(material), ...extraUrls(material)].filter(Boolean)
  );
  // Larger-view lightbox for the gallery (Tess, 2026-08-20).
  const [lbIndex, setLbIndex] = useState<number | null>(null);

  function save() {
    if (!canEdit) return;
    start(async () => {
      await updateMaterial(material.id, draft, garments);
      router.refresh();
      onToast("Saved");
    });
  }
  // Crop-on-upload: chosen files queue up and are shown in the cropper one at a
  // time (Tess, 2026-08-20: crop scope "All uploads + re-crop"). The user crops or
  // adds as-is; each is uploaded in its own request (several photos in one request
  // exceed Next's 25 MB Server-Action body limit and fail before the action runs,
  // which is why they used to vanish silently).
  const [queue, setQueue] = useState<File[]>([]);
  const [qBusy, setQBusy] = useState(false);
  const curFile = queue[0] ?? null;
  const curObjUrl = useMemo(
    () => (curFile ? URL.createObjectURL(curFile) : null),
    [curFile]
  );
  useEffect(() => {
    return () => {
      if (curObjUrl) URL.revokeObjectURL(curObjUrl);
    };
  }, [curObjUrl]);

  function chooseImages(list: FileList | null) {
    if (!canEdit) return;
    const files = Array.from(list ?? []).filter(isImageish);
    if (files.length) setQueue(files);
  }
  async function uploadOne(file: File, crop: CropRect | null): Promise<void> {
    // Shrink oversize photos in the browser before sending — a 40 MB camera JPEG
    // would otherwise be refused by the 25 MB request limit.
    const toSend = await downscaleImage(file);
    const fd = new FormData();
    fd.append("files", toSend);
    if (crop) fd.set("crop", JSON.stringify(crop));
    setUploading(true);
    try {
      const res = await addMaterialImages(material.id, fd);
      if (res.ok) {
        setImgs((cur) => [...cur, ...res.urls]);
        router.refresh();
        onToast(crop ? "Cropped & added" : "Image added");
      } else {
        onToast(res.errors[0] || "Couldn't add — try a smaller image");
      }
    } catch {
      onToast("Couldn't add — try a smaller image");
    } finally {
      setUploading(false);
    }
  }
  function nextInQueue() {
    setQueue((q) => q.slice(1));
  }
  async function applyQueueCrop(rect: CropRect) {
    if (!curFile) return;
    setQBusy(true);
    await uploadOne(curFile, rect);
    setQBusy(false);
    nextInQueue();
  }
  async function skipQueueCrop() {
    if (!curFile) return;
    setQBusy(true);
    await uploadOne(curFile, null);
    setQBusy(false);
    nextInQueue();
  }

  // Re-crop an image already on the material — same cropper, applied server-side
  // in place so the image keeps its slot and cover.
  const [recropUrl, setRecropUrl] = useState<string | null>(null);
  const [recropBusy, setRecropBusy] = useState(false);
  async function applyRecrop(rect: CropRect) {
    if (!recropUrl) return;
    const url = recropUrl;
    setRecropBusy(true);
    const res = await cropMaterialImage(material.id, url, rect);
    if (res.ok && res.url) {
      const next = res.url;
      setImgs((cur) => cur.map((u) => (u === url ? next : u)));
      router.refresh();
      onToast("Cropped");
    } else {
      onToast(res.error || "Couldn't crop");
    }
    setRecropBusy(false);
    setRecropUrl(null);
  }
  function deleteImage(url: string) {
    if (!canEdit) return;
    setImgs((cur) => cur.filter((u) => u !== url));
    start(async () => {
      await removeMaterialImage(material.id, url);
      router.refresh();
    });
  }
  function makeCover(url: string) {
    if (!canEdit) return;
    setImgs((cur) => [url, ...cur.filter((u) => u !== url)]);
    onToast("Cover set");
    start(async () => {
      await setMaterialCover(material.id, url);
      router.refresh();
    });
  }
  // Rotate an image a quarter-turn clockwise, in place (Tess, 2026-08-20). The
  // turn happens server-side; on success the URL is swapped so the new (rotated)
  // object shows without a reload.
  const [rotating, setRotating] = useState<string | null>(null);
  function rotateImage(url: string) {
    if (!canEdit || rotating) return;
    setRotating(url);
    start(async () => {
      const res = await rotateMaterialImage(material.id, url, 90);
      if (res.ok && res.url) {
        const next = res.url;
        setImgs((cur) => cur.map((u) => (u === url ? next : u)));
        router.refresh();
        onToast("Rotated");
      } else {
        onToast(res.error || "Couldn't rotate");
      }
      setRotating(null);
    });
  }
  // Brighten a step, in place (Tess, 2026-08-20). Clicks compound; the server
  // reads the already-brightened object each time.
  const [brightening, setBrightening] = useState<string | null>(null);
  function brightenImage(url: string) {
    if (!canEdit || brightening) return;
    setBrightening(url);
    start(async () => {
      const res = await brightenMaterialImage(material.id, url, 1.15);
      if (res.ok && res.url) {
        const next = res.url;
        setImgs((cur) => cur.map((u) => (u === url ? next : u)));
        router.refresh();
        onToast("Brightened");
      } else {
        onToast(res.error || "Couldn't brighten");
      }
      setBrightening(null);
    });
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
          {imgs.length > 0 && (
            <div className="grid dens-md mat-images">
              {imgs.map((src, i) => (
                <div className="card lib-card mat-gimg" key={src}>
                  <div className="imgwrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={material.name}
                      loading="lazy"
                      className="mat-zoom"
                      title="View larger"
                      onClick={() => setLbIndex(i)}
                    />
                    {i === 0 ? (
                      <span className="mat-cover-tag">Cover</span>
                    ) : (
                      canEdit && (
                        <button
                          type="button"
                          className="mat-setcover"
                          title="Make this the cover"
                          onClick={() => makeCover(src)}
                        >
                          Set cover
                        </button>
                      )
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="mat-bright"
                        title="Brighten"
                        aria-label="Brighten image"
                        disabled={brightening === src}
                        onClick={() => brightenImage(src)}
                      >
                        ☀
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="mat-crop"
                        title="Crop"
                        aria-label="Crop image"
                        onClick={() => setRecropUrl(src)}
                      >
                        ⌗
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="mat-rotate"
                        title="Rotate 90°"
                        aria-label="Rotate image"
                        disabled={rotating === src}
                        onClick={() => rotateImage(src)}
                      >
                        ↻
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="pg-img-x"
                        title="Remove image"
                        aria-label="Remove image"
                        onClick={() => deleteImage(src)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {lbIndex !== null && (
            <Lightbox
              images={imgs}
              index={lbIndex}
              onIndex={setLbIndex}
              onClose={() => setLbIndex(null)}
            />
          )}
          {curFile && curObjUrl && (
            <ImageCropper
              src={curObjUrl}
              title={queue.length > 1 ? `Crop before adding — 1 of ${queue.length}` : "Crop before adding"}
              busy={qBusy}
              skipLabel="Add without cropping"
              onSkip={skipQueueCrop}
              onApply={applyQueueCrop}
              onCancel={() => setQueue([])}
            />
          )}
          {recropUrl && (
            <ImageCropper
              src={recropUrl}
              title="Crop image"
              busy={recropBusy}
              onApply={applyRecrop}
              onCancel={() => setRecropUrl(null)}
            />
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
              {/* Colour standard (Tess, 2026-08-23: "can you create a color
                  standard that lives in the tool for fred?"). standards is []
                  on every deploy but FRED, so this row — like the chip and the
                  filter above — is skipped there rather than showing an empty
                  picker. */}
              {standards.length > 0 && (
                <div className="mat-field">
                  <span className="mat-label">Colour standard</span>
                  <Select
                    className="select"
                    aria-label="Colour standard"
                    value={currentStd?.id ?? ""}
                    onChange={changeStandard}
                    options={[
                      { value: "", label: "—" },
                      ...pickerStandards.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                </div>
              )}
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

              {/* Two free-text fields, deliberately labelled by WHO READS THEM rather
                  than by what they hold (Tess, 2026-08-23: "split internal from
                  supplier-facing"). The old single Notes field printed verbatim on
                  supplier POs, carrying duty percentages and supplier contact
                  emails with it. */}
              <label className="mat-field mat-field-wide">
                <span className="mat-label">Internal notes — never printed on orders</span>
                <textarea
                  className="textarea"
                  rows={2}
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>

              <label className="mat-field mat-field-wide">
                <span className="mat-label">Spec / instructions — prints on orders</span>
                <textarea
                  className="textarea"
                  rows={2}
                  value={draft.supplier_notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, supplier_notes: e.target.value }))}
                />
              </label>

              <input ref={imgInput} type="file" accept={IMAGE_ACCEPT} multiple hidden
                onChange={(e) => { chooseImages(e.target.files); e.currentTarget.value = ""; }} />

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
              {[
                { key: "name", label: "Name" },
                ...fieldsFor(k),
                { key: "supplier_notes", label: "Spec / instructions (prints on orders)" },
                { key: "notes", label: "Internal notes (never printed)" },
              ].map((f) => {
                const v = (material[f.key as keyof Material] as string | null) ?? "";
                if (!v) return null;
                return (
                  <div className="pg-facts" key={f.key}>
                    <span className="k">{f.label}</span>
                    <div className="pg-fact-val">
                      {f.key === "ai_file" ? (
                        <a href={v} target="_blank" rel="noreferrer" className="btn link sm">
                          Open AI file ↗
                        </a>
                      ) : (
                        v
                      )}
                    </div>
                  </div>
                );
              })}
              {sourcingOf(material) && (
                <div className="pg-facts">
                  <span className="k">Sourcing</span>
                  <div className="pg-fact-val">{sourcingLabel(sourcingOf(material))}</div>
                </div>
              )}
              {standards.length > 0 && currentStd && (
                <div className="pg-facts">
                  <span className="k">Colour standard</span>
                  <div className="pg-fact-val">{currentStd.name}</div>
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
