"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

// Closing a form once it has actually saved.
//
// Tess, 2026-08-06: "if you click save on details or sample round it should
// save and close out box automatically".
//
// She is describing the same small friction twice: you press Save, the page
// updates behind the form, and the form is still sitting there looking exactly
// as it did — so the only way to find out whether it worked is to close the box
// yourself and look. Half the time you press Save again first, which is how a
// round ends up saved twice.
//
// The tempting fix is to close the box in the submit handler. That is wrong,
// and quietly: these forms post to server actions, so closing on submit
// unmounts the form while its request is still in the air, and a save that
// fails then fails invisibly with nothing left on screen to retry from. What
// this does instead is watch the form's OWN pending state — React tracks it,
// useFormStatus reports it — and close on the falling edge, when the action has
// come back and the page underneath has been revalidated. Save, then close, in
// that order, which is the order the sentence is in.
//
// useFormStatus only reports on the <form> above it in the tree, so this has to
// be rendered INSIDE the form it is closing. It draws nothing.

/** Fires `onDone` once, after the surrounding form's action completes. */
export default function CloseOnSave({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  // Whether we have seen this form in flight. Without it the effect would fire
  // on first render, when pending is false because nothing has happened yet
  // rather than because something has finished.
  const flew = useRef(false);

  useEffect(() => {
    if (pending) {
      flew.current = true;
      return;
    }
    if (flew.current) {
      flew.current = false;
      onDone();
    }
  }, [pending, onDone]);

  return null;
}

/**
 * The close function of the nearest ModalButton, or a no-op outside one.
 *
 * A context rather than a prop because the boxes are opened by a client
 * component and filled by the server — page.tsx renders the Edit details form
 * inside <ModalButton> and has no callback of its own to hand down.
 */
export const ModalCloseContext = createContext<() => void>(() => {});

/**
 * Drop this inside a form that lives in a ModalButton and the box shuts itself
 * once the save lands. Takes nothing: it finds the form above it and the box
 * around it on its own.
 */
export function ModalCloseOnSave() {
  const close = useContext(ModalCloseContext);
  return <CloseOnSave onDone={close} />;
}
