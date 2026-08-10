"use client";

// Repurpose into a new season — a button at the top, a box in the middle.
//
// Tess, 2026-08-05: "put repurpose to a new season as a small button toward top
// of the profile -- should open modal box with options."
//
// It was a collapsed <details> near the bottom of the identity column, under
// the sketch and above the sample rounds. That put the one action on this page
// that CREATES something — a whole new style, a whole new season — below every
// field that merely describes the current one, which is backwards: the thing
// you came to the page to do should not be the thing you have to scroll for.
//
// It is still a deliberate two-step. The button does nothing but open the box;
// the box is where the season is typed and the copy is made. What has changed
// is only how far away the box is.
//
// No window.confirm and no alert anywhere in here, on purpose: a native modal
// dialog freezes the page against everything else the tool does. This is a
// plain overlay — Escape closes it, clicking the backdrop closes it, and the
// form inside is the same server action the collapsed section always posted to.

import { useEffect, useRef, useState } from "react";

export default function RepurposeButton({
  action,
  styleName,
}: {
  /** repurposeStyle already bound to this style's id. */
  action: (formData: FormData) => void | Promise<void>;
  styleName: string;
}) {
  const [open, setOpen] = useState(false);
  const seasonRef = useRef<HTMLInputElement | null>(null);

  // Escape closes. Bound only while the box is open, so the page keeps its own
  // keyboard behaviour the rest of the time.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    // The season is the only field that has to be filled in, so the cursor
    // starts there rather than making everyone find it.
    seasonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
        Repurpose ↗
      </button>

      {open && (
        <div
          className="modal-overlay"
          // Backdrop only — a click that started inside the box and ended on the
          // overlay (a drag across a text field) must not count as "close".
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal modal-up" role="dialog" aria-modal="true" aria-label="Repurpose into a new season">
            <div className="modal-head">
              <span>Repurpose into a new season</span>
              <button type="button" className="btn link" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <p className="repurpose-note">
                Makes a new style from this one. Category, garment, factory, tech pack, cover image
                and the <strong>fit notes</strong> come with it. Sample rounds, photography and
                comments start empty, and <strong>this style is not changed</strong> — last season
                stays readable exactly as it is.
              </p>
              <form action={action} style={{ marginTop: 14 }}>
                <div className="row3">
                  <div className="field">
                    <label>New season</label>
                    <input className="input" name="season" placeholder="SS28" ref={seasonRef} />
                  </div>
                  <div className="field">
                    <label>Name (optional)</label>
                    <input className="input" name="name" placeholder={`${styleName} — SS28`} />
                  </div>
                  <div className="field">
                    <label>Style no. (optional)</label>
                    <input className="input" name="style_no" placeholder="blank unless you have one" />
                  </div>
                </div>
                <button className="btn" type="submit">
                  Repurpose
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
