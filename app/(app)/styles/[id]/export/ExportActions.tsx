"use client";

// The ways this document leaves the app (P4).
//
// Down to one here. "Copy" put the rendered HTML on the clipboard for a paste
// into Google Docs; it has been removed (Tess, 2026-08-10: "remove the 'copy'
// option on history and notes exports -- only allow pdf or csv"). The two ways
// out the studio keeps are Save-as-PDF, which is this button, and Export CSV,
// which is its own control on the style profile beside "Export history" — so
// this page does not need to carry it too.
//
// "Save as document" (an HTML-bodied .doc) went earlier, on 2026-08-07.
// lib/docExport.ts is left in place — nothing calls it now, but it is the whole
// of the work if a real .docx is ever wanted, and deleting it would mean writing
// it again.
export default function ExportActions() {
  return (
    <div className="export-actions no-print">
      <button className="btn sm" type="button" onClick={() => window.print()}>
        Save as PDF
      </button>
    </div>
  );
}
