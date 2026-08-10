"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StyleVersion } from "@/lib/types";
import type { VariationStyle } from "@/lib/variations";
import Variations, { type VariationSource } from "./Variations";

// Versions — the list, and the two ways to add to it.
//
// Tess, 2026-08-05: "under versions, change it to be two small buttons
// 'duplicate + edit' and 'create new version with ai'. These would then open
// modal boxes."
//
// The two controls that used to sit here were "Add version" (a form that
// expanded in place) and "Try with AI" (a whole tool that expanded in place,
// pushing the sample rounds a screen and a half down the page). Both of them
// grew the page downward from a narrow column, which is why they read as
// confusing: the thing you were doing appeared *below* the thing you were doing
// it to, at the width of a sidebar.
//
// So: two small buttons, two boxes. Same shape as Repurpose at the top of the
// page — see RepurposeButton.tsx, which is the pattern being followed here.
//
// NO window.confirm AND NO alert, anywhere. A native dialog freezes the page.
// These are plain overlays: Escape closes, the backdrop closes, and the form
// inside posts to the same server action it always did.
//
// WHAT THE TWO BUTTONS ARE, exactly, because the words are easy to confuse:
//
//   Duplicate + edit    makes a NEW STYLE — this garment again, described
//                       again, normally because a second factory is developing
//                       it. It has its own profile, its own rounds, its own
//                       photography. The two profiles find each other by style
//                       number and link to each other automatically (see
//                       lib/styleSiblings.ts). Nothing about this style changes.
//
//   New version with AI makes a VERSION OF THIS STYLE — one change to the
//                       garment, drawn from a picture of it, filed in the list
//                       above and flagged AI. This style keeps its own profile;
//                       the variation is an entry in its history.
//
// WHAT CAME OUT ON 2026-08-05, and why (Tess: "remove v1 thumbnails / remove
// add 1 by hand / once a new version is created it should live under the
// buttons as a small link"):
//
//   The thumbnail grid. A version is usually a sentence — "new colorway, sage"
//   — with no picture behind it, so the grid was mostly big empty boxes with a
//   number in them, taking a screen of a narrow column to say four words. The
//   versions that DO have a picture have it because AI drew them, and that
//   picture is one click away either way. A list of lines says the same thing
//   in a tenth of the space, and the space belongs to the sample rounds.
//
//   "Add one by hand". The hand-typed form was a third control competing with
//   the two that matter, for the rarest case in the section. Nothing is lost
//   from the record — every version ever written still lists here, addVersion
//   still exists and is still called from elsewhere — the form is just no
//   longer in the way of the two things people actually do.

function when(ts: string | null | undefined): string {
  return ts ? ts.slice(0, 10) : "";
}

/** Escape-to-close, bound only while a box is open. */
function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
}

function Modal({
  label,
  wide,
  onClose,
  children,
}: {
  label: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-overlay"
      // Backdrop only — a drag that starts inside a text field and ends out
      // here must not count as "close".
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={"modal" + (wide ? " modal-lg" : " modal-up")} role="dialog" aria-modal="true" aria-label={label}>
        <div className="modal-head">
          <span>{label}</span>
          <button type="button" className="btn link" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function VersionStrip({
  styleId,
  versions,
  style,
  aiConnected,
  duplicate,
  factories,
  sources,
}: {
  styleId: string;
  versions: StyleVersion[];
  style: VariationStyle;
  aiConnected: boolean;
  /** duplicateStyle, already bound to this style's id. */
  duplicate: (formData: FormData) => void | Promise<void>;
  /** Factories already in use, so the new one can be picked rather than spelled. */
  factories: string[];
  /** Every picture of this garment, for the AI box to work from. */
  sources: VariationSource[];
}) {
  const [box, setBox] = useState<"" | "dup" | "ai">("");
  const close = () => setBox("");
  useEscape(box !== "", close);

  const n = versions.length;

  return (
    <div className="section" id="versions">
      <h3>Versions</h3>

      {/* The two things anybody comes to this section to do, first — the list
          of what has already been done reads underneath them. */}
      <div className="ver-buttons">
        <button type="button" className="btn ghost sm" onClick={() => setBox("dup")}>
          Duplicate + edit
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setBox("ai")}>
          New version with AI
        </button>
      </div>

      {/* An empty version list now says nothing at all (Tess, 2026-08-07).
          The paragraph that used to sit here explained what versions were for,
          which is a thing you need told once and then have to read past every
          time you open a style that has none — and the two buttons directly
          above it already say what they do. */}
      {n === 0 ? null : (
        <ul className="ver-list">
          {versions.map((v) => {
            // The line is the same everywhere; what it is wrapped in depends
            // on what there is to go to, and nothing without somewhere to go
            // pretends to be clickable — a dead link is worse than plain text.
            //
            // A version that made a whole separate profile wins (Tess,
            // 2026-08-05: "versions listed should hyperlink to new proifle").
            // That is a Duplicate + edit or a Repurpose, and the useful place
            // to land is the profile it made — its own rounds, its own
            // photography, its own answer to "where is this". A picture is the
            // fallback, as before.
            const line = (
              <>
                <strong>v{v.version_no}</strong>
                <span className="ver-what">{v.changes || v.notes || "—"}</span>
                {v.season && <span className="ver-season">{v.season}</span>}
                {v.is_ai_generated && (
                  <span className="badge ai sm" title="Made with AI, not photographed">
                    AI
                  </span>
                )}
                <span className="ver-when">{when(v.created_at)}</span>
              </>
            );
            return (
              <li key={v.id}>
                {v.spawned_style_id ? (
                  <Link
                    href={`/styles/${v.spawned_style_id}`}
                    className="ver-to"
                    title="Open the profile this made"
                  >
                    {line}
                    <span className="ver-go" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ) : v.image ? (
                  <a href={v.image} target="_blank" rel="noreferrer" title="Open the image full size">
                    {line}
                  </a>
                ) : (
                  <span>{line}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {box === "dup" && (
        <Modal label="Duplicate this style" onClose={close}>
          <p className="repurpose-note">
            Makes a <strong>new style</strong> from this one — the same garment, the same season,
            normally because another factory is developing it. Everything describing the garment
            comes with it, including the fit notes, the technical drawing and the library
            references. Sample rounds, photographs and comments start empty, because those belong
            to whoever made them.
            <br />
            <br />
            The style number comes across on purpose: that is what makes the two profiles recognise
            each other, and each one will link to the other. <strong>This style is not changed.</strong>
          </p>
          <form action={duplicate} style={{ marginTop: 14 }}>
            <div className="row3">
              <div className="field">
                <label>Factory</label>
                <input
                  className="input"
                  name="factory"
                  list="dup-factories"
                  placeholder="who is making this one"
                  autoFocus
                />
                <datalist id="dup-factories">
                  {factories.map((f) => (
                    <option value={f} key={f} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>Name (optional)</label>
                <input className="input" name="name" placeholder="named for the factory if left blank" />
              </div>
              <div className="field">
                <label>Colour(s) (optional)</label>
                <input className="input" name="colors" placeholder="carried over if left blank" />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Season (optional)</label>
                <input className="input" name="season" placeholder="the same season if left blank" />
              </div>
              <div className="field">
                <label>Style no. (optional)</label>
                <input className="input" name="style_no" placeholder="the same number if left blank" />
              </div>
            </div>
            <button className="btn" type="submit">
              Duplicate
            </button>
          </form>
        </Modal>
      )}

      {box === "ai" && (
        <Modal label="New version with AI" wide onClose={close}>
          <Variations styleId={styleId} connected={aiConnected} style={style} sources={sources} />
        </Modal>
      )}

    </div>
  );
}
