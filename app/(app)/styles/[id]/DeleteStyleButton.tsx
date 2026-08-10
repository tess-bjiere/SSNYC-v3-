"use client";

import { useState, useTransition } from "react";

// Send this style to the Trash.
//
// Tess, 2026-08-05: "you should be able to delete a style and have it sent to
// the trash."
//
// Three things about this control are deliberate.
//
// It is the quietest thing in the page head. Deleting a style is not a daily
// act and it should not compete with Repurpose or Export history for the eye —
// it is text, in the muted colour, at the end of the row.
//
// It arms rather than asks. NO window.confirm, ever: a native dialog freezes
// the page and takes the Chrome extension with it. The first click turns the
// word into "Move to Trash?" and the second does it, and moving the mouse away
// disarms it. Two clicks, no modal, no way to do it by accident on the way to
// something else.
//
// And nothing is destroyed. deleteStyle writes one timestamp; the rounds, the
// photographs, the comments and the versions all stay exactly where they are,
// and Restore in the Trash puts the style back untouched. The button says so,
// because "Delete" on its own reads as final and would stop people using a
// thing that is completely reversible.
export default function DeleteStyleButton({
  action,
}: {
  /** deleteStyle, already bound to this style's id. */
  action: () => void | Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  return (
    <span className="del-style" onMouseLeave={() => setArmed(false)}>
      {armed ? (
        <button
          type="button"
          className="btn link danger"
          disabled={pending}
          onClick={() => start(() => void action())}
        >
          {pending ? "Moving…" : "Move to Trash?"}
        </button>
      ) : (
        <button
          type="button"
          className="btn link"
          onClick={() => setArmed(true)}
          title="Moves this style to the Trash. Nothing is lost — the rounds, sample images and comments stay, and Restore puts it back."
        >
          Delete
        </button>
      )}
    </span>
  );
}
