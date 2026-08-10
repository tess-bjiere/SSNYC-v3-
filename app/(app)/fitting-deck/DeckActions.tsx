"use client";

// The one way the fitting deck leaves the app: Save as PDF, which is the
// browser's print-to-PDF (Tess, 2026-08-10: "export to a pretty pdf deck").
// Same shape as the other exports — no clipboard, no mail, nothing sent.
export default function DeckActions() {
  return (
    <div className="export-actions no-print">
      <button className="btn sm" type="button" onClick={() => window.print()}>
        Save as PDF
      </button>
    </div>
  );
}
