"use client";

import Select from "@/app/components/Select";
import { useMemo, useState } from "react";
import { refThumb, extraImageUrls, type Reference } from "@/lib/types";
import { resolveDesigners, resolveList, type ListsSetting } from "@/lib/lists";
import UploadModal from "../library/UploadModal";
import DetailModal from "../library/DetailModal";

// Editorial images are credited, not specced: who shot it, who is in it, where.
// The filters follow the original tool — designer, year, model — and the search
// box reaches the credit fields the dropdowns don't cover.
const FACETS: { key: keyof Reference; label: string }[] = [
  { key: "designer", label: "Designer" },
  { key: "year", label: "Year" },
  { key: "model", label: "Model" },
];

const SIZE_MIN: Record<string, number> = { sm: 150, md: 190, lg: 250 };

function GridIcon({ n }: { n: number }) {
  const gap = 1.4;
  const total = 14;
  const s = (total - (n - 1) * gap) / n;
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      cells.push(<rect key={`${x}-${y}`} x={x * (s + gap)} y={y * (s + gap)} width={s} height={s} rx={0.5} fill="currentColor" />);
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      {cells}
    </svg>
  );
}

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
    <div className="page">
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
        <div className="dens" title="Image size">
          {([["sm", 4, "Smaller"], ["md", 3, "Medium"], ["lg", 2, "Larger"]] as const).map(([k, n, label]) => (
            <button key={k} className={"dens-btn" + (size === k ? " active" : "")} onClick={() => setSize(k)} title={label}>
              <GridIcon n={n} />
            </button>
          ))}
        </div>
        <button className="btn sm" onClick={() => setUploading(true)}>+ Add</button>
      </div>

      <div className="lib-bar">
        <div className="lib-filters" style={{ margin: 0 }}>
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
        <input
          className="input lib-search"
          placeholder="Search campaign by designer, photographer, model, location, year…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <div className="empty">
          {refs.length === 0
            ? "No campaign images yet. Use + Add to upload the first one."
            : "No campaign images match those filters."}
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${SIZE_MIN[size]}px,1fr))` }}>
          {list.map((r) => {
            const src = refThumb(r);
            const sub = [r.year && r.year !== "Unknown" ? r.year : null, r.photographer, r.model]
              .filter(Boolean)
              .join(" · ");
            const extra = extraImageUrls(r).length;
            return (
              <div className="card lib-card" key={r.id} onClick={() => setDetail(r)}>
                {extra > 0 && <span className="card-extra">+{extra}</span>}
                <div className="imgwrap">{src ? <img src={src} alt={r.designer || ""} loading="lazy" /> : null}</div>
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
