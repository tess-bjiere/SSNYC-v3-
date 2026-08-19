"use client";

import { useState } from "react";
import Combo from "./Combo";

// One editable field in the bulk-edit sheet. `options` (when given) feeds the
// same styled autocomplete the single Edit form uses, so a bulk value is picked
// from the very same vocabulary.
export type BulkField = { key: string; label: string; options?: string[] };

// Edit several references at once (Tess, 2026-08-19: "add bulk select / edit /
// delete option for references and campaign libraries"). The rule that keeps
// this safe: you fill only the fields you want to change, and a blank field is
// left exactly as it was on every row — so a bulk edit never quietly wipes the
// fields you didn't touch. Clearing a field across the selection is deliberately
// not offered here; it's rare and would read the same as "left blank".
export default function BulkEditModal({
  count,
  fields,
  onClose,
  onApply,
}: {
  count: number;
  fields: BulkField[];
  onClose: () => void;
  onApply: (patch: Record<string, string>) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const patch = fields.reduce<Record<string, string>>((acc, f) => {
    const v = (draft[f.key] ?? "").trim();
    if (v) acc[f.key] = v;
    return acc;
  }, {});
  const nSet = Object.keys(patch).length;

  async function apply() {
    if (nSet === 0) return;
    setBusy(true);
    try {
      await onApply(patch);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      {/* The backdrop is scenery, not a control — a stray click on it shouldn't
          throw away the fields you've filled (same rule as the materials modals,
          Tess 2026-08-19). Close or Apply are the ways out. */}
      <div className="modal modal-sm">
        <div className="modal-head">
          <span>Edit {count} {count === 1 ? "item" : "items"}</span>
          <button className="notes-close" onClick={onClose} title="Close">×</button>
        </div>
        <div className="modal-body mat-form bulk-edit">
          <p className="bulk-hint">
            Fill only what you want to change. Blank fields stay as they are on all {count}.
          </p>
          {fields.map((f) => (
            <label className="mat-field bulk-field" key={f.key}>
              <span className="mat-label">{f.label}</span>
              {f.options && f.options.length > 0 ? (
                <Combo
                  value={draft[f.key] ?? ""}
                  options={f.options}
                  onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                />
              ) : (
                <input
                  className="input"
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <div className="mat-tools">
            <button type="button" className="btn" disabled={busy || nSet === 0} onClick={apply}>
              {busy ? "Applying…" : nSet === 0 ? "Apply" : `Apply to ${count}`}
            </button>
            <button type="button" className="ph-link" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
