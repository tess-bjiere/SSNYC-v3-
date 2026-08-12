"use client";

// The profile picture, front and back, in one frame.
//
// Tess, 2026-08-05: "profile image should have an arrow to view back as opposed
// to having it as 2 stacked images."
//
// It was two pictures side by side, which halved both of them in a 320px column
// and made the identity of the style — the thing this picture exists to state —
// smaller the moment somebody drew the back. A garment has one face. The back
// is the same garment turned around, so it belongs in the same frame, reached
// rather than displayed.
//
// Both images are in the DOM from the first paint and only their opacity
// changes, so the flip is instant and the back is already loaded when it is
// asked for. Rendering one at a time would mean a blank frame on the first
// click of every style, every session.
//
// The caption bar carries both facts a person needs: which picture they are
// looking at, and that there is another one. When there is no other one it
// carries the way to make one instead, so the missing back is still visible
// without costing half the frame.

import { useState } from "react";

/** Just enough of a lib/styleCover.ts Face to draw it. */
export type CoverSide = { url: string; label: string };

/**
 * Jump to the section that fills the missing side, opening it on the way.
 *
 * Sketch is a collapsed <details> now (Tess, 2026-08-05: "design section should
 * collapsed since the profile images are already viewable"), and a plain #hash
 * scrolls to a shut box: the browser only auto-opens a <details> when the
 * target is *inside* it, and here the target is the box itself. So the link
 * opens it first and then scrolls. Falling back to normal link behaviour if the
 * element is missing means a renamed anchor degrades to a no-op rather than to
 * a click that silently does nothing.
 */
function reveal(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  const el = document.querySelector(href);
  if (!el) return;
  e.preventDefault();
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function CoverFace({
  name,
  front,
  back,
  addHref,
}: {
  name: string;
  front: CoverSide | null;
  back: CoverSide | null;
  /** Where to go to fill the missing side — null when there is nothing to add to. */
  addHref: string | null;
}) {
  // A style whose only drawing is a back view shows the back: styleFaces()
  // returns front:null, back:set, and the frame should still hold a picture.
  const sides: CoverSide[] = [front, back].filter(Boolean) as CoverSide[];
  const [i, setI] = useState(0);
  const cur = sides[i] ?? sides[0] ?? null;

  if (!cur) {
    return (
      <figure className="cover">
        <a
          href={addHref ?? "#sketch"}
          className="cover-blank"
          onClick={(e) => reveal(e, addHref ?? "#sketch")}
        >
          Add a sketch
        </a>
      </figure>
    );
  }

  const both = sides.length > 1;

  return (
    <figure className="cover">
      {sides.map((s, n) => (
        <img
          key={s.url + n}
          src={s.url}
          alt={n === 0 ? name : `${name} — ${s.label.toLowerCase()}`}
          className={"cover-face" + (n === i ? " on" : "")}
          // The hidden one is still fetched — that is the point — but it is not
          // announced twice to a screen reader.
          aria-hidden={n === i ? undefined : true}
        />
      ))}

      <figcaption className="cover-tag">
        <span>{cur.label}</span>
        {both ? (
          <button
            type="button"
            className="cover-flip"
            onClick={() => setI(i === 0 ? 1 : 0)}
            aria-label={i === 0 ? "View the back" : "View the front"}
          >
            {i === 0 ? "Back ›" : "‹ Front"}
          </button>
        ) : addHref ? (
          // Hidden on a phone (Tess, 2026-08-11: "remove add back on sample
          // sketch on mobile") — adding a back is a desk task; once a back
          // exists the flip control above lets you switch between the two.
          <a className="cover-flip cover-addback" href={addHref} onClick={(e) => reveal(e, addHref)}>
            Add back ›
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
