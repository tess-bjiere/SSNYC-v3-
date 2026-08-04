"use client";

import { useState } from "react";

// The three ways this document leaves the app (P4).
//
// "Copy for Google Docs" puts the rendered HTML on the clipboard, so a paste
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
  filename,
}: {
  targetId: string;
  text: string;
  filename: string;
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

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="export-actions no-print">
      <button className="btn sm" type="button" onClick={copyRich}>
        Copy for Google Docs
      </button>
      <button className="btn ghost sm" type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      <button className="btn ghost sm" type="button" onClick={download}>
        Download .txt
      </button>
      {said && <span className="export-said">{said}</span>}
    </div>
  );
}
