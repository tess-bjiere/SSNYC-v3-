"use client";

import { useEffect } from "react";

// The one way the fitting deck leaves the app: Save as PDF, which is the
// browser's print-to-PDF (Tess, 2026-08-10: "export to a pretty pdf deck").
// Same shape as the other exports — no clipboard, no mail, nothing sent.
//
// The browser suggests document.title as the print-to-PDF filename, so the page
// names itself for the file the studio wants: SS_Fitting_<date> (Tess,
// 2026-08-10: "it should title itself SS_Fitting_(Date)"). The previous title is
// put back when the deck is left, so the rest of the app keeps its own.
export default function DeckActions({ fileTitle }: { fileTitle: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = fileTitle;
    return () => {
      document.title = previous;
    };
  }, [fileTitle]);

  return (
    <div className="export-actions no-print">
      <button
        className="btn sm"
        type="button"
        onClick={() => {
          // Reassert the name right before printing, in case anything touched it.
          document.title = fileTitle;
          window.print();
        }}
      >
        Save as PDF
      </button>
    </div>
  );
}
