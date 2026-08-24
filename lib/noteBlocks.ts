/**
 * Turn a block of typed notes into text paragraphs and bullet lists (Tess,
 * 2026-08-24: "Ability to add bullets").
 *
 * The convention is the one everybody already types without being told: a line
 * that starts with `-`, `*` or `•` and a space is a bullet. A run of them becomes
 * one list; everything else stays plain text with its line breaks intact. No
 * other Markdown — this is notes, not a document, and turning `#` into a heading
 * or `**x**` into bold would surprise more than it helped.
 *
 * Pure and dependency-free so the decision is unit-tested; the rendering (and the
 * link-making inside each line) lives in app/components/Linked.tsx.
 */

export type NoteBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] };

// A leading `-`, `*` or `•` followed by whitespace. The captured group is the
// item's own text, with the marker and the space after it removed.
const BULLET = /^\s*[-*•]\s+(.*)$/;

/** Does this text use any bullet lines? Lets a caller keep the plain path when it
 *  does not, so ordinary notes render exactly as they always have. */
export function hasBullets(text: string | null | undefined): boolean {
  return (text ?? "").split("\n").some((line) => BULLET.test(line));
}

/** Split notes into text paragraphs and bullet lists, in order. */
export function parseNoteBlocks(text: string | null | undefined): NoteBlock[] {
  const lines = (text ?? "").split("\n");
  const blocks: NoteBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (BULLET.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(BULLET);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push({ kind: "list", items });
    } else {
      const textLines: string[] = [];
      while (i < lines.length && !BULLET.test(lines[i])) {
        textLines.push(lines[i]);
        i += 1;
      }
      const text = textLines.join("\n");
      // An empty run — the "" from splitting empty input, or blank lines at a
      // boundary — is not a paragraph and does not become a block.
      if (text) blocks.push({ kind: "text", text });
    }
  }

  return blocks;
}
