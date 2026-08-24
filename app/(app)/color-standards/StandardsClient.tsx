"use client";

import { useState } from "react";
import Link from "next/link";
import { rollup, specLine, type ColorStandard } from "@/lib/colorStandards";
import { createStandard } from "@/app/actions/colorStandards";

// The columns the index needs off a material: enough to build the live-id set
// rollup() checks against, and a name for the day this card wants one. Kept
// deliberately light — the detail page is the one that reads a material's full
// profile.
export type StandardMaterial = {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  supplier: string | null;
};

// The colour standards index (Tess, 2026-08-23). One card per standard: its
// swatch, name, spec line, and how many materials have signed off against it.
// Modelled on the materials library's header + archived-toggle idiom, cut down
// to what a standard actually needs — there is no kind tab here (a standard is
// one thing, not three libraries in one) and no search yet (a studio holds a
// handful of masters, not hundreds of swatches).
export default function StandardsClient({
  standards,
  materials,
}: {
  standards: ColorStandard[];
  materials: StandardMaterial[];
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);

  const liveIds = new Set(materials.map((m) => m.id));
  const shown = standards.filter((s) => s.archived === showArchived);

  function swatchChip(s: ColorStandard) {
    if (s.swatch_url) return <img className="cs-swatch" src={s.swatch_url} alt="" />;
    if (s.hex) return <span className="cs-swatch" style={{ background: s.hex }} />;
    return <span className="cs-swatch cs-swatch-empty" />;
  }

  function rollupLabel(s: ColorStandard) {
    const r = rollup(s, liveIds);
    if (!r.total) return "No materials linked";
    const parts = [`${r.approved} approved`, `${r.pending} pending`];
    if (r.rejected) parts.push(`${r.rejected} rejected`);
    return parts.join(" · ");
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Colour Standards</h1>
        <div className="spacer" />
        {/* Archived is a quiet text link off to the side, matching materials'
            "archived can be a smaller text link that's not in the main menu". */}
        <button
          type="button"
          className={"btn link sm mat-archived-link" + (showArchived ? " on" : "")}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "← Current standards" : "Archived"}
        </button>
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          + Add standard
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          {showArchived
            ? "No archived standards."
            : "No colour standards yet. Add one with the button above."}
        </div>
      ) : (
        <div className="cs-list">
          {shown.map((s) => (
            <Link key={s.id} href={`/color-standards/${s.id}`} className="cs-card">
              {swatchChip(s)}
              <span className="cs-card-body">
                <span className="cs-card-name">{s.name}</span>
                {specLine(s) && <span className="cs-card-spec">{specLine(s)}</span>}
                <span className="cs-card-rollup">{rollupLabel(s)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {adding && <AddStandard onClose={() => setAdding(false)} />}
    </div>
  );
}

// The add form posts straight to createStandard, which redirects to the new
// standard's detail page on success — no client round-trip needed, the same
// shape as material-orders' one-line create form. Kind and brightener are
// native radio groups (the "radios, not buttons with state" idiom from
// SampleRounds.tsx's RatingField) so the tri-state brightener posts correctly
// with no JS at all.
function AddStandard({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay">
      {/* The backdrop is scenery, not a control (see MaterialsClient's
          MaterialForm for the full story) — close or save are the ways out. */}
      <div className="modal mat-modal">
        <div className="modal-head">
          <span>Add colour standard</span>
          <button className="notes-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <form action={createStandard} className="modal-body mat-form">
          <label className="mat-field">
            <span className="mat-label">Name *</span>
            <input className="input" name="name" required autoFocus />
          </label>
          <label className="mat-field">
            <span className="mat-label">Label</span>
            <input className="input" name="label" placeholder="e.g. Optic White" />
          </label>
          <div className="mat-field">
            <span className="mat-label">White or colour</span>
            <div className="cs-seg-row" role="radiogroup" aria-label="White or colour">
              <label className="cs-seg">
                <input type="radio" name="kind" value="white" />
                <span>White</span>
              </label>
              <label className="cs-seg">
                <input type="radio" name="kind" value="color" />
                <span>Colour</span>
              </label>
            </div>
          </div>
          <label className="mat-field">
            <span className="mat-label">Pantone</span>
            <input className="input" name="pantone" placeholder="e.g. 11-0601 TCX" />
          </label>
          <label className="mat-field">
            <span className="mat-label">Hex</span>
            <input className="input" name="hex" placeholder="#RRGGBB" />
          </label>
          <label className="mat-field mat-field-wide">
            {/* Reads as an instruction, not a database field. */}
            <span className="mat-label">Where the physical standard lives</span>
            <input
              className="input"
              name="master_location"
              placeholder="e.g. Studio swatch binder, shelf 2"
            />
          </label>
          <label className="mat-field">
            <span className="mat-label">Approved on</span>
            <input className="input" type="date" name="approved_on" />
          </label>
          <label className="mat-field">
            <span className="mat-label">Approved by</span>
            <input className="input" name="approved_by" />
          </label>
          <div className="mat-field">
            <span className="mat-label">Optical brightener</span>
            <div className="cs-seg-row" role="radiogroup" aria-label="Optical brightener">
              <label className="cs-seg">
                <input type="radio" name="brightener" value="yes" />
                <span>Yes</span>
              </label>
              <label className="cs-seg">
                <input type="radio" name="brightener" value="no" />
                <span>No</span>
              </label>
              <label className="cs-seg">
                <input type="radio" name="brightener" value="" defaultChecked />
                <span>Unknown</span>
              </label>
            </div>
          </div>
          <label className="mat-field mat-field-wide">
            <span className="mat-label">Spec</span>
            <textarea className="textarea" rows={2} name="spec" />
          </label>
          <label className="mat-field mat-field-wide">
            <span className="mat-label">Notes</span>
            <textarea className="textarea" rows={2} name="notes" />
          </label>

          <div className="mat-tools">
            <button type="submit" className="btn">
              Save
            </button>
            <button type="button" className="ph-link" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
