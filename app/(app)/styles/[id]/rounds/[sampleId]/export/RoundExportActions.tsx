"use client";

// How one round leaves the app and reaches a factory.
//
// Tess, 2026-08-05: "User should have the ability to export notes / images from
// a specific sample round and email them to factory."
//
// NOTHING HERE SENDS ANYTHING, and that has not changed. What leaves this page
// is a file or a clipboard; a person attaches it to their own mail and presses
// send. An app that silently emails a factory on a button press is an app
// nobody can trust with a factory relationship — the first time it sends the
// wrong round to the wrong mill, the tool is finished.
//
// Two ways out, down from four (Tess, 2026-08-07: "remove open in mail from
// sned notes option", then "remove save as document from send notes option").
//
// "Open in mail" handed a prepared mailto: draft to the machine's mail client.
// A mailto URL has a length cap, so a photograph-heavy round had to be cut to
// fit it — and the cut fell on exactly the rounds most worth sending.
//
// "Save as document" wrote an HTML-bodied .doc. That module is still here and
// still used by the style history export; it is this page that no longer offers
// it. A round going to a factory is read in a mail body or printed, not opened
// in Word, and a button nobody presses is a button in the way.
//
// What is left is the pair that actually get used: the rich copy, which carries
// the headings, rules and images into a mail in one paste, and the print, which
// is also the way to a PDF.
export default function RoundExportActions() {
  return (
    <div className="export-actions no-print">
      {/* "Copy everything" removed (Tess, 2026-08-10: "remove the 'copy' option
          on history and notes exports -- only allow pdf or csv"). Save-as-PDF is
          what leaves this page now. */}
      <button className="btn sm" type="button" onClick={() => window.print()}>
        Save as PDF
      </button>
    </div>
  );
}
