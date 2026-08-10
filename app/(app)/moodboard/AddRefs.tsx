"use client";

import Select from "@/app/components/Select";
import { useState, useTransition } from "react";
import { refImage, type Reference } from "@/lib/types";
import { addRefsToBoard, addStylesToBoard } from "@/app/actions/moodboards";

/** A style as this panel needs it — enough to find it and enough to show it. */
export type BoardStyle = {
  id: string;
  name: string;
  season: string;
  status: string;
  src: string;
};

export default function AddRefs({
  boardId,
  library,
  styles,
  sections,
}: {
  boardId: string;
  library: Reference[];
  /**
   * Styles in development, addable to the board (Tess, 2026-08-06: "You should
   * be able to add styles in development to moodboards").
   */
  styles: BoardStyle[];
  sections: { tid: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  // Which shelf you are picking from. Two lists, one panel, one search box and
  // one "add to" — because the question being answered is the same one ("what
  // goes on this board") and splitting it into two panels would put the same
  // three controls on the page twice.
  const [source, setSource] = useState<"library" | "styles">("library");

  const filtered = q.trim()
    ? library.filter((r) =>
        [r.designer, r.garment, r.color, r.category, r.year]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())
      )
    : library;

  const styleHits = q.trim()
    ? styles.filter((st) =>
        [st.name, st.season, st.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())
      )
    : styles;

  function add(ref: Reference) {
    setAdded((s) => new Set(s).add(ref.id));
    startTransition(() => addRefsToBoard(boardId, [ref.id], target || null));
  }

  function addStyle(st: BoardStyle) {
    setAdded((s) => new Set(s).add(st.id));
    startTransition(() => addStylesToBoard(boardId, [st.id], target || null));
  }

  const targetLabel = sections.find((s) => s.tid === target)?.label || "the end of the board";

  return (
    <div className="section" style={{ marginTop: 40 }}>
      <h3 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Add to this board</span>
        <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show"}
        </button>
      </h3>

      {open && (
        <>
          <div className="addrefs-bar">
            {/* Two shelves, named for what is on them rather than for the
                tables underneath. */}
            <div className="addrefs-source" role="group" aria-label="What to add">
              <button
                type="button"
                className={"btn sm" + (source === "library" ? "" : " ghost")}
                onClick={() => setSource("library")}
              >
                References
              </button>
              <button
                type="button"
                className={"btn sm" + (source === "styles" ? "" : " ghost")}
                onClick={() => setSource("styles")}
              >
                In development
              </button>
            </div>
            <input
              className="input"
              placeholder={
                source === "library"
                  ? "Search your library by designer, garment, color…"
                  : "Search your styles by name, season, status…"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 460 }}
            />
            {sections.length > 0 && (
              <label className="addrefs-target">
                <span>Add to</span>
                <Select
                  className="select"
                  aria-label="Add to"
                  value={target}
                  onChange={setTarget}
                  options={[
                    { value: "", label: "End of board" },
                    ...sections.map((s) => ({ value: s.tid, label: s.label })),
                  ]}
                />
              </label>
            )}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 12 }}>
            Click any image to add it to {targetLabel}.{pending ? " Adding…" : ""}
            {source === "styles" &&
              " A style shows its current cover, so it keeps up as the photographs get better."}
          </div>
          {source === "styles" ? (
            <div className="grid">
              {styleHits.map((st) => {
                const isAdded = added.has(st.id);
                // A board is pictures. A style with no photograph and no sketch
                // has nothing to put on the wall, so it is shown greyed rather
                // than hidden — hidden would read as "that style is missing",
                // and the fix (draw it, or shoot it) is worth naming.
                const noPicture = !st.src;
                return (
                  <button
                    key={st.id}
                    className="card"
                    onClick={() => addStyle(st)}
                    disabled={isAdded || noPicture}
                    style={{
                      textAlign: "left",
                      border: "none",
                      padding: 0,
                      cursor: isAdded || noPicture ? "default" : "pointer",
                      opacity: isAdded || noPicture ? 0.45 : 1,
                      background: "var(--panel)",
                    }}
                    title={
                      noPicture
                        ? "No photograph or sketch yet — nothing to put on a board"
                        : isAdded
                          ? "Added"
                          : "Add to board"
                    }
                  >
                    <div className="imgwrap">
                      {st.src ? <img src={st.src} alt={st.name} loading="lazy" /> : null}
                    </div>
                    <div className="meta">
                      <div className="d">{isAdded ? "✓ Added" : st.name}</div>
                      <div className="s">
                        {noPicture
                          ? "No picture yet"
                          : [st.season, st.status].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </button>
                );
              })}
              {styleHits.length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {styles.length === 0
                    ? "No styles yet."
                    : "No styles match that."}
                </div>
              )}
            </div>
          ) : (
          <div className="grid">
            {filtered.map((r) => {
              const src = refImage(r);
              const isAdded = added.has(r.id);
              return (
                <button
                  key={r.id}
                  className="card"
                  onClick={() => add(r)}
                  disabled={isAdded}
                  style={{
                    textAlign: "left",
                    border: "none",
                    padding: 0,
                    cursor: isAdded ? "default" : "pointer",
                    opacity: isAdded ? 0.45 : 1,
                    background: "var(--panel)",
                  }}
                  title={isAdded ? "Added" : "Add to board"}
                >
                  <div className="imgwrap">
                    {src ? <img src={src} alt={r.designer || ""} loading="lazy" /> : null}
                  </div>
                  <div className="meta">
                    <div className="d">{isAdded ? "✓ Added" : r.designer || "Untitled"}</div>
                    <div className="s">{[r.garment, r.color].filter(Boolean).join(" · ")}</div>
                  </div>
                </button>
              );
            })}
          </div>
          )}
        </>
      )}
    </div>
  );
}
