"use client";

import Select from "@/app/components/Select";
import { useMemo, useState } from "react";
import { refThumb, extraImageUrls, type Reference } from "@/lib/types";
import { resolveDesigners, resolveList, type ListsSetting } from "@/lib/lists";
import UploadModal from "../library/UploadModal";
import DetailModal from "../library/DetailModal";
import SizeToggle from "@/app/components/SizeToggle";

// Editorial images are credited, not specced: who shot it, who is in it, where.
// The filters follow the original tool — designer, year, model — and the search
// box reaches the credit fields the dropdowns don't cover.
const FACETS: { key: keyof Reference; label: string }[] = [
  { key: "designer", label: "Designer" },
  { key: "year", label: "Year" },
  { key: "model", label: "Model" },
];

export default function EditorialClient({
  refs,
  lists,
  designers,
}: {
  refs: Reference[];
  lists: ListsSetting;
  designers: string[];
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("newest");
  const [size, setSize] = useState("md");
  // Same phone organisation as the References library (Tess, 2026-08-11):
  // filters fold behind one button so the default is search + grid.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [detail, setDetail] = useState<Reference | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  // Credit fields have no curated vocabulary behind them — a photographer or a
  // location is whatever was typed — so these dropdowns are built from what the
  // rows actually carry.
  const inUse = useMemo(() => {
    const keys = ["designer", "year", "season", "model", "photographer", "location"] as const;
    const o: Record<string, string[]> = {};
    for (const k of keys) {
      o[k] = Array.from(
        new Set(refs.map((r) => ((r[k] as string) || "").trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
    }
    return o;
  }, [refs]);

  const options = useMemo(() => {
    return {
      designer: resolveDesigners(designers, inUse.designer),
      year: inUse.year,
      model: inUse.model,
    } as Record<string, string[]>;
  }, [designers, inUse]);

  // Suggestions for the add form: the curated designer and season lists, plus
  // whatever the existing credits already use.
  const formOptions = useMemo(() => {
    return {
      designer: resolveDesigners(designers, inUse.designer),
      year: inUse.year,
      season: resolveList("season", lists),
      photographer: inUse.photographer,
      model: inUse.model,
      location: inUse.location,
    } as Record<string, string[]>;
  }, [designers, lists, inUse]);

  const list = useMemo(() => {
    let out = refs.filter((r) => {
      for (const f of FACETS) {
        const v = sel[f.key];
        if (v && (r[f.key] as string) !== v) return false;
      }
      if (q.trim()) {
        const hay = [r.designer, r.photographer, r.photographer_ig, r.model, r.location, r.year, r.season, r.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "designer") return (a.designer || "").localeCompare(b.designer || "");
      if (sort === "photographer") return (a.photographer || "").localeCompare(b.photographer || "");
      if (sort === "model") return (a.model || "").localeCompare(b.model || "");
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    return out;
  }, [refs, q, sel, sort]);

  const activeFilters = Object.values(sel).filter(Boolean).length + (q.trim() ? 1 : 0);

  return (
    <div className="page lib-page">
      <div className="page-head">
        <h1 className="page-title display">Campaign</h1>
        <div className="spacer" />
        <Select
          className="select lib-sort"
          aria-label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "designer", label: "Designer A–Z" },
            { value: "photographer", label: "Photographer" },
            { value: "model", label: "Model" },
          ]}
        />
        <div className="lib-head-tools">
          <SizeToggle value={size} onChange={setSize} />
          <button className="btn lib-add-desk" onClick={() => setUploading(true)}>+ Add</button>
        </div>
      </div>

      {/* Prominent, full-width upload — phone/tablet only, like the library. */}
      <button className="btn lib-add-mobile" onClick={() => setUploading(true)}>
        + Add campaign image
      </button>

      <div className="lib-bar">
        <input
          className="input lib-search"
          placeholder="Search campaign by designer, photographer, model, location, year…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <button
        className={"btn ghost sm lib-filter-toggle" + (filtersOpen ? " on" : "")}
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((o) => !o)}
      >
        Filter{activeFilters > 0 ? ` (${activeFilters})` : ""}
      </button>

      <div className={"lib-filters" + (filtersOpen ? " open" : "")}>
        {FACETS.map((f) => (
          <Select
            key={f.key}
            className="select"
            aria-label={f.label}
            value={sel[f.key] || ""}
            onChange={(v) => setSel((s) => ({ ...s, [f.key]: v }))}
            options={[
              { value: "", label: f.label },
              ...(options[f.key] ?? []).map((v) => ({ value: v, label: v })),
            ]}
          />
        ))}
        {activeFilters > 0 && (
          <button className="btn link" onClick={() => { setSel({}); setQ(""); }}>
            Clear ({activeFilters})
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          {refs.length === 0
            ? "No campaign images yet. Use + Add to upload the first one."
            : "No campaign images match those filters."}
        </div>
      ) : (
        <div className={"grid dens-" + size}>
          {list.map((r) => {
            const src = refThumb(r);
            const sub = [r.year && r.year !== "Unknown" ? r.year : null, r.photographer, r.model]
              .filter(Boolean)
              .join(" · ");
            const extra = extraImageUrls(r).length;
            return (
              <div className="card lib-card" key={r.id} onClick={() => setDetail(r)}>
                <div className="imgwrap">
                  {src ? <img src={src} alt={r.designer || ""} loading="lazy" /> : null}
                  {extra > 0 && <span className="card-extra">+{extra}</span>}
                </div>
                <div className="meta">
                  <div className="d">{r.designer || "Untitled"}</div>
                  {sub && <div className="s">{sub}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <DetailModal
          r={detail}
          actions="editorial"
          onClose={() => setDetail(null)}
          onToast={flashToast}
          onDeleted={() => { setDetail(null); flashToast("Moved to Trash"); }}
        />
      )}

      {uploading && (
        <UploadModal
          kind="editorial"
          options={formOptions}
          onClose={() => setUploading(false)}
          onToast={flashToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
