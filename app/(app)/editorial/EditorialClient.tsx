"use client";

import Select from "@/app/components/Select";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refThumb, extraImageUrls, type Reference } from "@/lib/types";
import { addRefsToBoard } from "@/app/actions/moodboards";
import { softDeleteReference } from "@/app/actions/references";
import { resolveDesigners, resolveList, type ListsSetting } from "@/lib/lists";
import UploadModal from "../library/UploadModal";
import DetailModal from "../library/DetailModal";
import SizeToggle from "@/app/components/SizeToggle";

// Editorial images are credited, not specced: who shot it, who is in it, where.
// The filters follow the original tool — designer, year, model — and the search
// box reaches the credit fields the dropdowns don't cover.
const FACETS: { key: keyof Reference; label: string }[] = [
  { key: "designer", label: "Designer" },
  // Photographer and Location lead the credit filters — finding a photographer,
  // and seeing who has shot in a city, is most of how Campaign gets used for
  // FRED's marketing (Tess, 2026-08-17).
  { key: "photographer", label: "Photographer" },
  { key: "location", label: "Location" },
  { key: "model", label: "Model" },
  { key: "year", label: "Year" },
];

export default function EditorialClient({
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
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("newest");
  const [size, setSize] = useState("md");
  // Campaign view options (Tess, 2026-08-17): show the grid as bare images with
  // no credits, and/or in black & white — for looking at a campaign as a wall of
  // pictures rather than a filed, captioned list.
  const [imagesOnly, setImagesOnly] = useState(false);
  const [mono, setMono] = useState(false);
  // Same phone organisation as the References library (Tess, 2026-08-11):
  // filters fold behind one button so the default is search + grid.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [detail, setDetail] = useState<Reference | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Images the user has just ✕'d out — hidden at once, then soft-deleted (they go
  // to Trash, recoverable), the same optimistic pattern the photographer grid
  // uses (Tess, 2026-08-18: "easily delete images in campaign … and references").
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const router = useRouter();
  // Add-to-moodboard, straight off a thumbnail (Tess, 2026-08-17). Same two-step
  // picker as the Library: pick a board, then a section if it has any.
  const [picker, setPicker] = useState<Reference | null>(null);
  const [pickBoard, setPickBoard] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  function addToBoard(boardId: string, label: string, ref: Reference, sectionTid?: string | null) {
    start(() => addRefsToBoard(boardId, [ref.id], sectionTid ?? null));
    flashToast(`Added to ${label}`);
    setPicker(null);
    setPickBoard(null);
  }

  // Delete one campaign image straight from its thumbnail — hide it now, soft
  // delete behind (recoverable in Trash), then reconcile from the server.
  function removeCard(id: string) {
    setHidden((prev) => new Set(prev).add(id));
    flashToast("Moved to Trash");
    start(async () => {
      await softDeleteReference(id);
      router.refresh();
    });
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
      photographer: inUse.photographer,
      location: inUse.location,
      model: inUse.model,
      year: inUse.year,
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
      if (hidden.has(r.id)) return false;
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
      if (sort === "location") return (a.location || "").localeCompare(b.location || "");
      if (sort === "model") return (a.model || "").localeCompare(b.model || "");
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    return out;
  }, [refs, q, sel, sort, hidden]);

  const activeFilters = Object.values(sel).filter(Boolean).length + (q.trim() ? 1 : 0);

  return (
    <div className="page lib-page">
      <div className="page-head">
        <h1 className="page-title display">Campaign</h1>
        <div className="spacer" />
        <Select
          className="select sm lib-sort"
          aria-label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "designer", label: "Designer A–Z" },
            { value: "photographer", label: "Photographer" },
            { value: "location", label: "Location" },
            { value: "model", label: "Model" },
          ]}
        />
        <div className="lib-head-tools">
          <SizeToggle value={size} onChange={setSize} />
          {/* Two view options for the campaign wall — bare images, and B&W. */}
          <button
            type="button"
            className={"btn ghost sm" + (imagesOnly ? " on" : "")}
            aria-pressed={imagesOnly}
            onClick={() => setImagesOnly((v) => !v)}
            title="Hide the credits — show images only"
          >
            Images only
          </button>
          <button
            type="button"
            className={"btn ghost sm" + (mono ? " on" : "")}
            aria-pressed={mono}
            onClick={() => setMono((v) => !v)}
            title="Show the grid in black &amp; white"
          >
            B&amp;W
          </button>
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
        <div className={"grid dens-" + size + (mono ? " ed-mono" : "")}>
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
                  {/* Delete straight from the thumbnail — one click, to Trash. */}
                  <button
                    type="button"
                    className="card-del"
                    title="Delete (moves to Trash)"
                    aria-label="Delete image"
                    onClick={(e) => { e.stopPropagation(); removeCard(r.id); }}
                  >
                    ✕
                  </button>
                  {/* Drop this image onto a moodboard without opening it. */}
                  {boards.length > 0 && (
                    <button
                      type="button"
                      className="card-mb"
                      title="Add to moodboard"
                      aria-label="Add to moodboard"
                      onClick={(e) => { e.stopPropagation(); setPickBoard(null); setPicker(r); }}
                    >
                      ＋
                    </button>
                  )}
                </div>
                {/* The credits, unless "Images only" is on. */}
                {!imagesOnly && (
                  <div className="meta">
                    <div className="d">{r.designer || "Untitled"}</div>
                    {sub && <div className="s">{sub}</div>}
                  </div>
                )}
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

      {/* Board picker — pick a board, then a section within it if it has any. */}
      {picker && (
        <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
          <div className="modal modal-sm">
            <div className="modal-head">
              <span>Add “{picker.designer || picker.photographer || "image"}” to…</span>
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
