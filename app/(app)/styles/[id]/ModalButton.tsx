"use client";

import { useCallback, useEffect, useState } from "react";
import { ModalCloseContext } from "@/app/components/CloseOnSave";

// A small button that opens a box (Tess, 2026-08-05: "Edit details should be a
// small button that then opens up the options in a modal / sketch should be a
// small button that then opens up the options in a modal").
//
// Both of those were <details> panels in the identity column, and both had the
// same problem: opening one pushed everything under it down a screen, so the
// act of editing a field moved the sample rounds — the thing the page is
// actually for — out of sight. A column is the wrong shape for a form anyway;
// the Edit details form has three fields to a row and was being asked to live
// in about 320 pixels.
//
// The contents are passed in as children and rendered by the server. This
// component only knows how to open and close, which is why the same twenty
// lines can carry a form bound to a server action and a set of photo cards
// without knowing what either of them is.
//
// NO window.confirm AND NO alert, anywhere near this — a native dialog freezes
// the page and takes the Chrome extension with it. This is a plain overlay:
// Escape closes it, the backdrop closes it, and anything inside posts exactly
// as it did when it was a panel. Same pattern as RepurposeButton.tsx and the
// boxes in VersionStrip.tsx.
export default function ModalButton({
  label,
  title,
  hint,
  wide,
  link,
  openOnHash,
  children,
}: {
  /** What the button says. */
  label: string;
  /** What the box is called once it is open. Defaults to the button's words. */
  title?: string;
  /** A small line beside the button — a count, a progress note. */
  hint?: string;
  wide?: boolean;
  /** Render the trigger as a quiet text link rather than an outlined button —
   *  used for Edit details, which rides on the Details header (Tess, 2026-08-11). */
  link?: boolean;
  /**
   * A fragment that opens this box, e.g. "sketch" for links pointing at
   * #sketch.
   *
   * The sketch used to be a <details id="sketch">, and the profile picture's
   * "Add a sketch" / "Add back" links point straight at it. Turning it into a
   * box would have quietly broken both — the link would still scroll to
   * nothing and the person would still have no way to put a drawing in. So the
   * box answers the anchor: same href, same result, one fewer trip down the
   * page.
   */
  openOnHash?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!openOnHash) return;
    const want = "#" + openOnHash;
    // Two listeners because a click on #sketch from this page fires hashchange,
    // and a click on #sketch from somewhere else arrives with the hash already
    // set and never fires anything.
    const check = () => {
      if (window.location.hash === want) setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [openOnHash]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <div className="modal-btn-row" id={openOnHash}>
        <button
          type="button"
          className={link ? "btn link" : "btn ghost sm"}
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
        {hint && <span className="ph-progress">{hint}</span>}
      </div>

      {open && (
        <div
          className="modal-overlay"
          // Backdrop only — a drag that starts in a text field and ends out
          // here must not count as "close", or a half-typed form vanishes.
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className={"modal" + (wide ? " modal-lg" : " modal-up")}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? label}
          >
            <div className="modal-head">
              <span>{title ?? label}</span>
              <button type="button" className="btn link" onClick={close}>
                Close
              </button>
            </div>
            {/* The close function goes down as context so that a form
                rendered by the server inside this box can shut it once its save
                lands — see ModalCloseOnSave (Tess, 2026-08-06: "if you click
                save on details or sample round it should save and close out box
                automatically"). */}
            <div className="modal-body">
              <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
