"use client";

import Select from "@/app/components/Select";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { refThumb, extraImageUrls, type Reference } from "@/lib/types";
import { addRefsToBoard } from "@/app/actions/moodboards";
import {
  LIST_FIELDS,
  resolveDesigners,
  resolveFilterOptions,
  resolveList,
  type ListField,
  type ListsSetting,
} from "@/lib/lists";
import UploadModal from "./UploadModal";
import DetailModal from "./DetailModal";
import ListsPanel from "./ListsPanel";

const FACETS: { key: keyof Reference; label: string }[] = [
  { key: "designer", label: "Designer" },
  { key: "year", label: "Year" },
  { key: "season", label: "Season" },
  { key: "category", label: "Category" },
  { key: "garment", label: "Garment" },
  { key: "fabric", label: "Fabric" },
  { key: "color", label: "Color" },
];

function yearNum(y?: string | null): number | null {
  if (!y) return null;
  const m = y.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

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

export default function LibraryClient({
  refs,
  boards,
  lists,
  designers,
}: {
  refs: Reference[];
  boards: { id: string; name: string; sections: { tid: string; label: string }[] }[];
  lists: ListsSetting;
  designers: string[];
}) {
  const [tab, setTab] = useState<"archival" | "market" | "all">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("newest");
  const [size, setSize] = useState("md");

  const [detail, setDetail] = useState<Reference | null>(null);
  const [picker, setPicker] = useState<Reference | null>(null);
  const [pickBoard, setPickBoard] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [managing, setManaging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  // Deep link: /library?ref=<id> opens that reference's card straight away.
  //
  // This is what the "Reference(s)" strip on a style profile links to (Tess,
  // 2026-08-05: "These should link to editable view of product from library").
  // The reference used to link to /r/<id>, which is the read-only page built
  // for sending outside the studio — you could look but not correct.
  //
  // Read off window.location rather than useSearchParams on purpose: this is a
  // one-shot instruction, not state the component tracks, and useSearchParams
  // would drag a Suspense boundary in around the whole library grid for a
  // question asked exactly once on mount.
  //
  // The query string is then wiped with replaceState, so closing the card
  // leaves you in the library rather than one refresh away from it opening
  // again, and a back-navigation does not re-summon a modal you just shut.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("ref");
    if (!id) return;
    window.history.replaceState(null, "", window.location.pathname);
    const hit = refs.find((r) => r.id === id);
    if (hit) setDetail(hit);
    // A linked reference can be in the Trash, in which case it is not in the
    // grid at all. Silence would read as a broken link, so say what happened.
    else flashToast("That reference is in the Trash.");
    // Mount only — a later change to `refs` is a re-render, not a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Values actually in use on a reference, per field. These are what keep a
  // removed-but-still-tagged option reachable in the filters.
  const inUse = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const f of FACETS) {
      o[f.key] = Array.from(
        new Set(refs.map((r) => ((r[f.key] as string) || "").trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
    }
    return o;
  }, [refs]);

  // Filter dropdowns: Tess's curated vocabulary from `settings.lists`, in her
  // order, plus any stray value a reference still carries. Deriving these from
  // the data alone (what this did before) threw her curation away and re-surfaced
  // every option she had deliberately removed.
  const options = useMemo(() => {
    const o: Record<string, string[]> = { year: inUse.year };
    o.designer = resolveDesigners(designers, inUse.designer);
    for (const f of LIST_FIELDS) o[f] = resolveFilterOptions(f, lists, inUse[f]);
    return o;
  }, [lists, designers, inUse]);

  // The add form offers the curated list only — free text is still allowed, but
  // an option Tess removed shouldn't be handed back to her as a suggestion.
  const formOptions = useMemo(() => {
    const o: Record<string, string[]> = { year: inUse.year };
    o.designer = resolveDesigners(designers, inUse.designer);
    for (const f of LIST_FIELDS) o[f] = resolveList(f as ListField, lists);
    return o;
  }, [lists, designers, inUse]);

  const list = useMemo(() => {
    let out = refs.filter((r) => {
      const n = yearNum(r.year);
      if (tab === "archival" && !(n != null && n < 2010)) return false;
      if (tab === "market" && !(n != null && n >= 2010)) return false;
      for (const f of FACETS) {
        const v = sel[f.key];
        if (v && (r[f.key] as string) !== v) return false;
      }
      if (q.trim()) {
        const hay = [r.designer, r.garment, r.color, r.category, r.season, r.notes, r.photographer, r.year]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "designer") return (a.designer || "").localeCompare(b.designer || "");
      if (sort === "category") return (a.category || "").localeCompare(b.category || "");
      if (sort === "garment") return (a.garment || "").localeCompare(b.garment || "");
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    return out;
  }, [refs, tab, q, sel, sort]);

  const activeFilters = Object.values(sel).filter(Boolean).length + (q.trim() ? 1 : 0);

  function addToBoard(boardId: string, label: string, ref: Reference, sectionTid?: string | null) {
    start(() => addRefsToBoard(boardId, [ref.id], sectionTid ?? null));
    setToast(`Added to ${label}`);
    setPicker(null);
    setPickBoard(null);
    setTimeout(() => setToast(null), 1800);
  }

  return (
    <div className="page">
      <div className="page-head">
        {/* "References", matching the tab (Tess, 2026-08-06: "change library to
            references"). The page heading follows the navigation, because a
            tab that says one word and a heading that says another reads as two
            different places. The route is still /library. */}
        <h1 className="page-title display">References</h1>
        <div className="spacer" />
        <Select
          className="select lib-sort"
          aria-label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "designer", label: "Designer A–Z" },
            { value: "category", label: "Category" },
            { value: "garment", label: "Garment" },
          ]}
        />
        <div className="dens" title="Image size">
          {([["sm", 4, "Smaller"], ["md", 3, "Medium"], ["lg", 2, "Larger"]] as const).map(([k, n, label]) => (
            <button key={k} className={"dens-btn" + (size === k ? " active" : "")} onClick={() => setSize(k)} title={label}>
              <GridIcon n={n} />
            </button>
          ))}
        </div>
        {/* Edit the vocabulary every dropdown on this page draws from. */}
        <button className="lib-trash-link" onClick={() => setManaging(true)}>Lists</button>
        {/* Deleted references live on in the Trash until someone empties it. */}
        <Link href="/trash" className="lib-trash-link">Trash</Link>
        <button className="btn sm" onClick={() => setUploading(true)}>+ Add</button>
      </div>

      <div className="lib-bar">
        <div className="lib-tabs">
          {([["archival", "Archival"], ["market", "In-Market"], ["all", "All"]] as const).map(([k, l]) => (
            <button key={k} className={"lib-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <input className="input lib-search" placeholder="Search designer, garment, color, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="lib-filters">
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
        <div className="empty">No references match those filters.</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${SIZE_MIN[size]}px,1fr))` }}>
          {list.map((r) => {
            const src = refThumb(r);
            const sub = [r.year && r.year !== "Unknown" ? r.year : null, r.garment, r.color].filter(Boolean).join(" · ");
            const extra = extraImageUrls(r).length;
            return (
              <div className="card lib-card" key={r.id} onClick={() => setDetail(r)}>
                <button
                  className="pin"
                  title="Add to a moodboard"
                  onClick={(e) => { e.stopPropagation(); setPicker(r); }}
                >
                  +
                </button>
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

      {/* Board picker — pick a board, then a section within it if it has any */}
      {picker && (
        <div className="modal-overlay" onClick={() => { setPicker(null); setPickBoard(null); }}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>Add “{picker.designer || "reference"}” to…</span>
              <button className="notes-close" onClick={() => { setPicker(null); setPickBoard(null); }}>×</button>
            </div>
            <div className="modal-body">
              {boards.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No boards yet.</div>
              ) : pickBoard ? (
                (() => {
                  const b = boards.find((x) => x.id === pickBoard);
                  if (!b) return null;
                  return (
                    <>
                      <div className="pick-step">
                        <button className="pick-back" onClick={() => setPickBoard(null)}>← Boards</button>
                        <span>{b.name}</span>
                      </div>
                      <div className="board-pick">
                        <button className="btn ghost sm" disabled={pending} onClick={() => addToBoard(b.id, b.name, picker, null)}>
                          End of board
                        </button>
                        {b.sections.map((s) => (
                          <button
                            key={s.tid}
                            className="btn ghost sm"
                            disabled={pending}
                            onClick={() => addToBoard(b.id, `${b.name} · ${s.label}`, picker, s.tid)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="board-pick">
                  {boards.map((b) => (
                    <button
                      key={b.id}
                      className="btn ghost sm"
                      disabled={pending}
                      onClick={() => (b.sections.length > 0 ? setPickBoard(b.id) : addToBoard(b.id, b.name, picker, null))}
                    >
                      {b.name}
                      {b.sections.length > 0 && <span className="pick-more"> ›</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail view */}
      {detail && (
        <DetailModal
          r={detail}
          onClose={() => setDetail(null)}
          onAdd={() => { setPicker(detail); setDetail(null); }}
          onToast={flashToast}
          onDeleted={() => { setDetail(null); flashToast("Moved to Trash"); }}
        />
      )}

      {/* Add / bulk upload */}
      {uploading && <UploadModal options={formOptions} onClose={() => setUploading(false)} onToast={flashToast} />}

      {/* Manage list options */}
      {managing && <ListsPanel lists={lists} onClose={() => setManaging(false)} onToast={flashToast} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
