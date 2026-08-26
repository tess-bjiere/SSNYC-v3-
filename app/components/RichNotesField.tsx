"use client";

// The notes editor's PUBLIC face — a light wrapper that lazy-loads the heavy
// TipTap editor (Tess, 2026-08-24: "go with TipTap" + "the app feels slow").
//
// It is drop-in for the server-action forms: it always renders the hidden
// <input name=…> that carries the note, seeded with the stored value, so a submit
// works even before (or without) the editor loading. The actual editor
// (RichEditorImpl — TipTap + ProseMirror, ~130kB) is dynamic()-imported with
// ssr:false, so that weight is a separate chunk fetched only when a form is being
// edited, not on every style-profile load. The editor reports edits up through
// onValue, which updates the hidden input in place.

import dynamic from "next/dynamic";
import { useRef } from "react";
import { docToText } from "@/lib/richNote";

// Loaded on demand. The fallback is a quiet box so the field does not jump.
const RichEditorImpl = dynamic(() => import("./RichEditorImpl"), {
  ssr: false,
  loading: () => (
    <div className="rich-field">
      <div className="rich-editor rich-loading" />
    </div>
  ),
});

export default function RichNotesField({
  name,
  defaultValue,
  placeholder,
  "aria-label": ariaLabel,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  /** Accepted for signature parity with the old NotesField. */
  className?: string;
  rows?: number;
  "aria-label"?: string;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <RichEditorImpl
        initialValue={defaultValue}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onValue={(v) => {
          if (hiddenRef.current) hiddenRef.current.value = v;
        }}
      />
      {/* Owns the form value. Seeded with the stored note as-is, so submitting
          without touching the editor saves exactly what was there; the editor
          overwrites it on the first edit. */}
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={defaultValue ?? ""} />
    </>
  );
}

/** Re-exported so callers can reach the plain-text view from one import. */
export { docToText };
