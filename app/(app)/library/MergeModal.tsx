"use client";

import { useState } from "react";

// Pick which of the selected profiles to keep, then merge the rest into it (Tess,
// 2026-09-09: "combine profile into one profile"). The keeper's own fields stay;
// every other profile's images fold onto it and the others move to Trash.

export default function MergeModal({
  refs,
  busy,
  onClose,
  onMerge,
}: {
  refs: { id: string; thumb: string; label: string }[];
  busy?: boolean;
  onClose: () => void;
  onMerge: (keeperId: string) => void;
}) {
  const [keeper, setKeeper] = useState(refs[0]?.id ?? "");
  const keeperLabel = refs.find((r) => r.id === keeper)?.label || "this one";

  return (
    <div className="modal-overlay">
      <div className="modal modal-sm">
        <div className="modal-head">
          <span>Merge {refs.length} profiles into one</span>
          <button className="notes-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="up-note">
            Choose the profile to keep — its details stay, and every other profile&rsquo;s images are
            added to it. The others move to Trash (recoverable).
          </p>
          <div className="merge-grid">
            {refs.map((r) => (
              <label key={r.id} className={"merge-opt" + (keeper === r.id ? " on" : "")}>
                <input
                  type="radio"
                  name="merge-keeper"
                  checked={keeper === r.id}
                  onChange={() => setKeeper(r.id)}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumb} alt="" />
                <span className="merge-lbl">{r.label || "Untitled"}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="up-foot">
          <button className="btn link" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn sm" disabled={!keeper || busy} onClick={() => onMerge(keeper)}>
            {busy ? "Merging…" : `Keep “${keeperLabel}”, merge the rest`}
          </button>
        </div>
      </div>
    </div>
  );
}
