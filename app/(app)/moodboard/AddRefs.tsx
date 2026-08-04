"use client";

import { useState, useTransition } from "react";
import { refImage, type Reference } from "@/lib/types";
import { addRefsToBoard } from "@/app/actions/moodboards";

export default function AddRefs({
  boardId,
  library,
  sections,
}: {
  boardId: string;
  library: Reference[];
  sections: { tid: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = q.trim()
    ? library.filter((r) =>
        [r.designer, r.garment, r.color, r.category, r.year]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())
      )
    : library;

  function add(ref: Reference) {
    setAdded((s) => new Set(s).add(ref.id));
    startTransition(() => addRefsToBoard(boardId, [ref.id], target || null));
  }

  const targetLabel = sections.find((s) => s.tid === target)?.label || "the end of the board";

  return (
    <div className="section" style={{ marginTop: 40 }}>
      <h3 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Add references from Library</span>
        <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show"}
        </button>
      </h3>

      {open && (
        <>
          <div className="addrefs-bar">
            <input
              className="input"
              placeholder="Search your library by designer, garment, color…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 460 }}
            />
            {sections.length > 0 && (
              <label className="addrefs-target">
                <span>Add to</span>
                <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">End of board</option>
                  {sections.map((s) => (
                    <option key={s.tid} value={s.tid}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 12 }}>
            Click any image to add it to {targetLabel}.{pending ? " Adding…" : ""}
          </div>
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
        </>
      )}
    </div>
  );
}
