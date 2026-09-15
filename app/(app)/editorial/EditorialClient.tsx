"use client";

import Select from "@/app/components/Select";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refThumb, extraImageUrls, type Reference } from "@/lib/types";
import { addRefsToBoard } from "@/app/actions/moodboards";
import {
  softDeleteReference,
  bulkUpdateReferences,
  bulkSoftDeleteReferences,
  toggleReferenceFavorite,
  mergeReferences,
} from "@/app/actions/references";
import { resolveDesigners, resolveList, type ListsSetting } from "@/lib/lists";
import { CAMPAIGN_KINDS, normalizeCampaignKind, type CampaignKind } from "@/lib/campaign";
import UploadModal from "../library/UploadModal";
import DetailModal from "../library/DetailModal";
import BulkEditModal, { type BulkField } from "../library/BulkEditModal";
import MergeModal from "../library/MergeModal";
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
  // Editorial vs Styling reference tabs (Tess, 2026-09-14: "option to sort by
  // editorial / image references or styling references"). "all" shows everything,
  // including images not yet tagged; the others filter to that kind. Campaign
  // opens on Editorial (Tess, 2026-09-15: "the default view should be editorial").
  const [tab, setTab] = useState<"all" | CampaignKind>("Editorial");
  const [sort, setSort] = useState("newest");
  const [size, setSize] = useState("md");
  // Campaign view options (Tess, 2026-08-17): show the grid as bare images with
  // no credits, and/or in black & white — for looking at a campaign as a wall of
  // pictures rather than a filed, captioned list.
  const [imagesOnly, setImagesOnly] = useState(false);
  const [mono, setMono] = useState(false);
  // The two wall views (images-only, B&W) tuck into one "View" menu so the bar
  // reads calmer (Tess, 2026-09-15 design pass). Closes on an outside click.
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!viewOpen) return;
    const onDown = (e: MouseEvent) => {
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [viewOpen]);
  // Same phone organisation as the References library (Tess, 2026-08-11):
  // filters fold behind one button so the default is search + grid.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Favorites — the shared star, mirrored from the References library (Tess,
  // 2026-09-15: "add ability to add stars to favorites in campaign section"). The
  // `favorite` flag lives on the row, so campaign images and library references
  // share the same star column; each grid just filters its own view. Optimistic
  // Set, same shape as the library.
  const [favs, setFavs] = useState<Set<string>>(
    () => new Set(refs.filter((r) => r.favorite).map((r) => r.id))
  );
  const [favOnly, setFavOnly] = useState(false);

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
  // Bulk select / edit / delete (Tess, 2026-08-19), same as the References grid.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkArm, setBulkArm] = useState(false);
  // Merge several campaign images into one, same as the References library (Tess,
  // 2026-09-15). Reuses mergeReferences + MergeModal — the images fold onto the
  // keeper, the others go to Trash.
  const [merging, setMerging] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [pending, start] = useTransition();

  function toggleFav(id: string) {
    const on = !favs.has(id);
    setFavs((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    toggleReferenceFavorite(id, on);
  }

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
      if (favOnly && !favs.has(r.id)) return false;
      if (tab !== "all" && normalizeCampaignKind(r.ref_kind) !== tab) return false;
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
  }, [refs, q, sel, sort, hidden, tab, favOnly, favs]);

  const activeFilters = Object.values(sel).filter(Boolean).length + (q.trim() ? 1 : 0);

  // --- Bulk select / edit / delete ---
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
    setBulkEditing(false);
    setBulkArm(false);
  }
  const shownIds = list.map((r) => r.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  function toggleSelectAll() {
    setSelected((prev) => {
      if (shownIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        for (const id of shownIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...shownIds]);
    });
  }
  // The credit fields, with the same option lists the add form offers.
  const bulkFields: BulkField[] = (
    [
      { key: "designer", label: "Designer" },
      { key: "photographer", label: "Photographer" },
      { key: "model", label: "Model" },
      { key: "location", label: "Location" },
      { key: "year", label: "Year" },
      { key: "season", label: "Season" },
    ] as const
  ).map((f) => ({ key: f.key, label: f.label, options: formOptions[f.key] ?? [] }));
  // Reference type has a fixed two-value vocabulary, so it carries its own options
  // rather than drawing from the curated lists (Tess, 2026-09-14). This is the
  // quickest way to tag the campaign images already on the wall — select a batch,
  // set Editorial or Styling.
  bulkFields.push({ key: "ref_kind", label: "Reference type", options: [...CAMPAIGN_KINDS] });
  async function applyBulkEdit(patch: Record<string, string>) {
    const ids = Array.from(selected);
    setBulkEditing(false);
    await bulkUpdateReferences(ids, patch);
    router.refresh();
    flashToast(`Updated ${ids.length}`);
    leaveSelect();
  }
  function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setHidden((prev) => new Set([...prev, ...ids]));
    flashToast(`Moved ${ids.length} to Trash`);
    start(async () => {
      await bulkSoftDeleteReferences(ids);
      router.refresh();
    });
    leaveSelect();
  }

  // The selected images as pick-the-keeper options for the merge dialog. Labelled
  // by credit (photographer / brand), fitting a campaign image.
  const mergeRefs = Array.from(selected)
    .map((id) => list.find((r) => r.id === id))
    .filter((r): r is Reference => Boolean(r))
    .map((r) => ({
      id: r.id,
      thumb: refThumb(r),
      label: [r.photographer, r.designer, r.model].filter(Boolean).join(" · "),
    }));
  async function applyMerge(keeperId: string) {
    const others = Array.from(selected).filter((id) => id !== keeperId);
    if (others.length === 0) return;
    setMergeBusy(true);
    const res = await mergeReferences(keeperId, others);
    setMergeBusy(false);
    setMerging(false);
    if (res.ok) {
      setHidden((prev) => new Set([...prev, ...others]));
      flashToast(`Merged ${others.length + 1} into one`);
      router.refresh();
      leaveSelect();
    } else {
      flashToast(res.error || "Couldn't merge.");
    }
  }

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
            // "Designer A–Z" dropped (Tess, 2026-09-14: "sorting by designer is
            // less important"); the Designer filter stays in the filter row.
            { value: "newest", label: "Newest" },
            { value: "photographer", label: "Photographer" },
            { value: "location", label: "Location" },
            { value: "model", label: "Model" },
          ]}
        />
        <div className="lib-head-tools">
          <SizeToggle value={size} onChange={setSize} />
          {/* The two wall views live in one "View" menu (Tess, 2026-09-15). The
              button shows a dot when a non-default view is on, so it still reads at
              a glance which is why the bar can be calmer. */}
          <div className="view-menu" ref={viewRef}>
            <button
              type="button"
              className={"btn ghost sm" + (imagesOnly || mono ? " on" : "")}
              aria-expanded={viewOpen}
              aria-haspopup="menu"
              onClick={() => setViewOpen((v) => !v)}
            >
              View{imagesOnly || mono ? ` (${(imagesOnly ? 1 : 0) + (mono ? 1 : 0)})` : ""}
            </button>
            {viewOpen && (
              <div className="view-pop" role="menu">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={imagesOnly}
                  className={"view-opt" + (imagesOnly ? " on" : "")}
                  onClick={() => setImagesOnly((v) => !v)}
                >
                  <span className="view-tick">{imagesOnly ? "✓" : ""}</span> Images only
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={mono}
                  className={"view-opt" + (mono ? " on" : "")}
                  onClick={() => setMono((v) => !v)}
                >
                  <span className="view-tick">{mono ? "✓" : ""}</span> Black &amp; white
                </button>
              </div>
            )}
          </div>
          {/* Bulk select — pick several, then edit or delete together. */}
          <button
            type="button"
            className={"btn ghost sm" + (selecting ? " on" : "")}
            onClick={() => (selecting ? leaveSelect() : setSelecting(true))}
          >
            {selecting ? "Done" : "Select"}
          </button>
          <button className="btn lib-add-desk" onClick={() => setUploading(true)}>+ Add</button>
        </div>
      </div>

      {/* Prominent, full-width upload — phone/tablet only, like the library. */}
      <button className="btn lib-add-mobile" onClick={() => setUploading(true)}>
        + Add campaign image
      </button>

      <div className="lib-bar">
        {/* Editorial / Styling reference tabs (Tess, 2026-09-14). All includes
            images not yet tagged; the others filter to that kind. */}
        <div className="lib-tabs">
          {([...CAMPAIGN_KINDS, "all" as const] as ("all" | CampaignKind)[]).map((k) => (
            <button
              key={k}
              className={"lib-tab" + (tab === k ? " active" : "")}
              onClick={() => setTab(k)}
            >
              {k === "all" ? "All" : k}
            </button>
          ))}
          {/* Shared ★ Favorites filter (Tess, 2026-09-15), same as the Library. */}
          <button
            className={"lib-tab lib-fav-tab" + (favOnly ? " active" : "")}
            onClick={() => setFavOnly((v) => !v)}
            aria-pressed={favOnly}
            title="Show only starred campaign images"
          >
            {favOnly ? "★" : "☆"} Favorites{favs.size ? ` (${favs.size})` : ""}
          </button>
        </div>
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
            // On Campaign the photographer / DP leads, not the brand (Tess,
            // 2026-09-15: "the photographer / DP name would be more important than
            // the brand"). Fall back to the brand, then "Untitled". The brand drops
            // to the sub-line (skipped there when it is already the lead).
            const lead = r.photographer || r.designer || "Untitled";
            const sub = [
              r.designer && r.designer !== lead ? r.designer : null,
              r.year && r.year !== "Unknown" ? r.year : null,
              r.model,
            ]
              .filter(Boolean)
              .join(" · ");
            const extra = extraImageUrls(r).length;
            const isSel = selected.has(r.id);
            return (
              <div
                className={"card lib-card" + (selecting ? " mat-selectable" : "") + (isSel ? " mat-selected" : "")}
                key={r.id}
                onClick={() => (selecting ? toggleSelect(r.id) : setDetail(r))}
              >
                <div className="imgwrap">
                  {src ? <img src={src} alt={r.photographer || r.designer || ""} loading="lazy" /> : null}
                  {extra > 0 && <span className="card-extra">+{extra}</span>}
                  {selecting && <span className="mat-check">{isSel ? "✓" : ""}</span>}
                  {/* Star this campaign image (Tess, 2026-09-15). Bottom-left, and a
                      starred image keeps its ★ visible so favorites read at a glance. */}
                  {!selecting && (
                    <button
                      type="button"
                      className={"card-fav" + (favs.has(r.id) ? " on" : "")}
                      title={favs.has(r.id) ? "Remove from favorites" : "Add to favorites"}
                      aria-label={favs.has(r.id) ? "Remove from favorites" : "Add to favorites"}
                      aria-pressed={favs.has(r.id)}
                      onClick={(e) => { e.stopPropagation(); toggleFav(r.id); }}
                    >
                      {favs.has(r.id) ? "★" : "☆"}
                    </button>
                  )}
                  {/* The ✕ delete and moodboard + are hidden in select mode — a
                      click on a card there means "tick this one". */}
                  {!selecting && (
                    <button
                      type="button"
                      className="card-del"
                      title="Delete (moves to Trash)"
                      aria-label="Delete image"
                      onClick={(e) => { e.stopPropagation(); removeCard(r.id); }}
                    >
                      ✕
                    </button>
                  )}
                  {!selecting && boards.length > 0 && (
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
                    <div className="d">{lead}</div>
                    {sub && <div className="s">{sub}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk action bar — appears while selecting (Tess, 2026-08-19). */}
      {selecting && (
        <div className="mo-pickbar bulk-bar">
          <span className="mo-pickbar-n">{selected.size} selected</span>
          <button type="button" className="btn link sm" onClick={toggleSelectAll}>
            {allShownSelected ? "Clear all" : "Select all"}
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn ghost sm"
            disabled={selected.size === 0}
            onClick={() => setBulkEditing(true)}
          >
            Edit
          </button>
          {/* Combine several campaign images into one (Tess, 2026-09-15). Needs at
              least two selected — one to keep, the rest fold in. */}
          <button
            type="button"
            className="btn ghost sm"
            disabled={selected.size < 2}
            onClick={() => setMerging(true)}
          >
            Merge
          </button>
          <button
            type="button"
            className={"btn ghost sm bulk-del" + (bulkArm ? " arm" : "")}
            disabled={selected.size === 0}
            onMouseLeave={() => setBulkArm(false)}
            onClick={() => (bulkArm ? bulkDelete() : setBulkArm(true))}
          >
            {bulkArm ? `Delete ${selected.size}?` : "Delete"}
          </button>
        </div>
      )}

      {merging && mergeRefs.length >= 2 && (
        <MergeModal
          refs={mergeRefs}
          busy={mergeBusy}
          onClose={() => setMerging(false)}
          onMerge={applyMerge}
        />
      )}

      {bulkEditing && (
        <BulkEditModal
          count={selected.size}
          fields={bulkFields}
          onClose={() => setBulkEditing(false)}
          onApply={applyBulkEdit}
        />
      )}

      {detail && (
        <DetailModal
          r={detail}
          actions="editorial"
          onClose={() => setDetail(null)}
          onToast={flashToast}
          onDeleted={() => { setDetail(null); flashToast("Moved to Trash"); }}
          favorited={favs.has(detail.id)}
          onToggleFavorite={() => toggleFav(detail.id)}
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
