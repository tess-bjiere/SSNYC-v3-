"use client";

import { useState } from "react";

// The ways this document leaves the app (P4).
//
// Two of them, down from three. "Save as document" downloaded the page as a
// Word-compatible file and it has been removed (Tess, 2026-08-07: "remove save
// as document when you export history"), following the same removal from the
// round export. What it produced was HTML wearing a .doc extension, and the
// fonts it landed with were never going to be the app's — the reader's machine
// decides that, not us. The copy carries the same headings, rules and tables
// into a Doc in one paste, and the print is a better PDF than Word would make
// of it.
//
// lib/docExport.ts is left in place. Nothing calls it now, and it is the whole
// of the work if a real .docx is ever wanted; deleting it would mean writing it
// again.
//
// "Copy" puts the rendered HTML on the clipboard, so a paste
// into Docs arrives with its headings and layout instead of as one grey wall of
// text. The page is deliberately black-on-white for exactly this reason: Docs
// keeps pasted colours, and cream text on a dark page would paste invisible.
//
// The async clipboard API is used when the browser has it and falls back to a
// selection copy, which is what Safari and older Chrome will take. If both fail
// the button says so rather than silently doing nothing — a copy that quietly
// fails is worse than one that never existed, because you paste last week's
// clipboard into a factory email and never notice.
export default function ExportActions({
  targetId,
  text,
}: {
  targetId: string;
  /** Plain-text form of the same document, for the clipboard fallback. */
  text: string;
}) {
  const [said, setSaid] = useState<string | null>(null);

  function flash(msg: string) {
    setSaid(msg);
    window.setTimeout(() => setSaid(null), 2400);
  }

  async function copyRich() {
    const node = document.getElementById(targetId);
    if (!node) return flash("Nothing to copy.");
    const html = node.outerHTML;

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        return flash("Copied — paste into a Google Doc.");
      }
    } catch {
      // fall through to the selection copy
    }

    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      sel?.removeAllRanges();
      sel?.addRange(range);
      const ok = document.execCommand("copy");
      sel?.removeAllRanges();
      return flash(ok ? "Copied — paste into a Google Doc." : "Couldn't copy — select the page and press ⌘C.");
    } catch {
      return flash("Couldn't copy — select the page and press ⌘C.");
    }
  }

  return (
    <div className="export-actions no-print">
      {/* The solid button now that it leads the row — it was always the one
          to press when the destination is a Doc. */}
      <button className="btn sm" type="button" onClick={copyRich}>
        Copy
      </button>
      <button className="btn link" type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      {said && <span className="export-said">{said}</span>}
    </div>
  );
}
