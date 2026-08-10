/**
 * Turning an export page into a file that opens as a real document.
 *
 * Tess, 2026-08-06: "Turn my exports into actual google docs -- i dont want to
 * have to paste".
 *
 * WHAT THIS DOES AND WHAT IT HONESTLY CANNOT. The pasting is the complaint, and
 * the pasting is what this removes: the export page now downloads a Word
 * document that Google Docs opens directly — File ▸ Open, or drag it onto a
 * Drive window, and it arrives as a Doc with its headings, its rules and its
 * tables intact. Nothing is selected, nothing is copied, nothing is pasted, and
 * nothing arrives as one grey wall of text.
 *
 * What it does NOT do is create the Doc inside her Drive on a button press.
 * That is a different class of work: it needs the app to hold a Google OAuth
 * client and ask each person for permission to write files to their Drive, and
 * no amount of editing an export module produces it. It is written down as its
 * own job rather than quietly approximated here. This is the whole of the
 * complaint that can be fixed today, and it is most of it.
 *
 * WHY A .doc OF HTML AND NOT A .docx. A real .docx is a zip of XML parts, which
 * means a zip writer in the browser to produce a file whose only advantage
 * would be its extension. Word, Pages, LibreOffice and Google Docs have all
 * imported HTML-bodied .doc files for twenty years, and the fidelity is better
 * than a paste because the styles travel in the file rather than through the
 * clipboard. If this ever needs to be a true .docx, it is a server route and a
 * library, and this function is where it gets replaced.
 *
 * THE PAGE IS ALREADY BLACK ON WHITE, on purpose — the export pages were built
 * that way so the colours survive leaving the app. Only the layout styles are
 * added here; the document keeps whatever the page itself said.
 *
 * Dependency-free so it can be unit tested on its own, like every rule module
 * in lib/. It takes a string of HTML and returns a string; it touches no DOM,
 * no Blob and no window.
 */

/** Word reads this as the page setup. One inch all round, portrait A4/Letter. */
const PAGE_CSS = `
  @page { size: letter; margin: 0.9in; }
  /* Tess, 2026-08-06: "Report output can still be tighter line spacing and
     smaller fonts" — the same scale the export page itself was cut to, so the
     downloaded document and the page it came from read alike. */
  /* Tess, 2026-08-07: "The docx saves with ugly fonts. It should be alternate
     serif fonts that match as closely as possible to our branding and sizing."

     SSYNC is set in Barlow Semi Condensed — a low-contrast, slightly narrowed
     grotesque. The serif that matches that skeleton is a slab, not a bookish
     old-style: Roboto Slab is the same class of letterform with serifs added,
     so a document in it reads as the same house as the app rather than as a
     different company's letterhead. Georgia was the wrong answer for exactly
     that reason — wide, high-contrast, and about a century away from Barlow.

     The stack matters more than the first name in it, because a font the
     reader does not have is a font Word replaces with Times New Roman, which
     is the ugly outcome being complained about. Roboto Slab and PT Serif are
     both in Google Docs' library, so an import resolves them by name; Cambria
     ships with Word on Mac and Windows and is the closest thing on the machine
     to a narrow, low-contrast serif; Georgia stays as the last stop before the
     browser's default, since a wide serif still beats Times.

     Sizes are unchanged. They were cut to this scale on Tess's own instruction
     ("Report output can still be tighter line spacing and smaller fonts") and
     the ratios already track the app's type scale: the display size is 1.47×
     body here against 1.52× in the app, and the lead is 1.10× against 1.12×.
     Weights follow SSYNC too — 600 on the small caps, 400 in the prose. */
  body { font-family: 'Roboto Slab', 'PT Serif', Cambria, Georgia, serif; font-size: 9.5pt;
         line-height: 1.34; color: #111; }
  h1 { font-size: 14pt; font-weight: 600; margin: 0 0 3pt; letter-spacing: -.005em; }
  h2 { font-size: 10.5pt; font-weight: 600; margin: 11pt 0 2pt; }
  /* The app sets every small-caps label at .12em. Kept here, at the smaller
     size the document runs at, so section labels read the same on paper. */
  h3 { font-size: 9.5pt; font-weight: 600; margin: 9pt 0 2pt; letter-spacing: .09em;
       text-transform: uppercase; }
  p, li, td, th { font-size: 9.5pt; line-height: 1.34; font-weight: 400; }
  /* Small caps in the body — the k/label spans the export pages use — carry the
     app's muted grey rather than going full black, which is what made the
     printed version read flatter than the screen. */
  .k, .cap, .badge { font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 2pt 4pt; vertical-align: top; text-align: left; }
  img { max-width: 100%; }
  a { color: #111; }
  hr { border: none; border-top: 1px solid #ccc; }
  .no-print { display: none; }
`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A complete Word-compatible document around a fragment of page HTML.
 *
 * `title` becomes the document's title, which is the name Google Docs shows in
 * the tab after an import — so it should be the same words as the filename.
 *
 * The ProgId comment is the marker Word and Docs look for to treat an HTML body
 * as a document rather than a web page; without it the import lands as plain
 * text and the headings are lost, which is the exact failure being fixed.
 */
export function wordDocument(bodyHtml: string, title: string): string {
  return [
    "<html xmlns:o='urn:schemas-microsoft-com:office:office'",
    " xmlns:w='urn:schemas-microsoft-com:office:word'",
    " xmlns='http://www.w3.org/TR/REC-html40'>",
    "<head><meta charset='utf-8'>",
    `<title>${esc(title)}</title>`,
    "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>",
    "</w:WordDocument></xml><![endif]-->",
    `<style>${PAGE_CSS}</style>`,
    "</head><body>",
    bodyHtml,
    "</body></html>",
  ].join("");
}

/** The MIME type the file is served as. Word, Pages and Docs all accept it. */
export const WORD_MIME = "application/msword";

/**
 * The same filename with a .doc extension.
 *
 * The export filenames are built elsewhere (lib/styleExport.ts,
 * lib/roundExport.ts) and end in .txt because that is what they used to
 * produce. Rewriting the extension here keeps the naming — style number, round,
 * date — in the one place that knows how to build it.
 */
export function asDocFilename(filename: string): string {
  const name = (filename ?? "").trim() || "export";
  return name.replace(/\.(txt|md|html?|doc|docx)$/i, "") + ".doc";
}
