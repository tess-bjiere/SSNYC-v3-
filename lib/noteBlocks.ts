/**
 * Turn a block of typed notes into text paragraphs and (possibly nested) bullet
 * lists (Tess, 2026-08-24: "Ability to add bullets", then "i need to be able to do
 * bullets and sub bullets in notes").
 *
 * A line that starts with `-`, `*` or `•` and a space is a bullet. Leading
 * whitespace before the marker sets its depth — two spaces or one tab per level —
 * so an indented bullet nests under the one above it. A run of bullets becomes one
 * (nested) list; everything else stays plain text with its line breaks intact. No
 * other Markdown: this is notes, not a document.
 *
 * Pure and dependency-free so the decision is unit-tested; the rendering (and the
 * link-making inside each line) lives in app/components/Linked.tsx, and the typing
 * help (Enter continues a bullet, Tab indents) in app/components/NotesField.tsx.
 */

export type BulletItem = { text: string; children: BulletItem[] };

export type NoteBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: BulletItem[] };

// A leading `-`, `*` or `•` followed by whitespace. Group 1 is the indent, 3 is
// the item's own text (marker and the space after it removed).
const BULLET = /^([ \t]*)([-*•])\s+(.*)$/;

/** Depth from leading whitespace: one tab, or two spaces, is one level. */
function indentUnits(ws: string): number {
  let cols = 0;
  for (const ch of ws) cols += ch === "\t" ? 2 : 1;
  return Math.floor(cols / 2);
}

/** Does this text use any bullet lines? Lets a caller keep the plain path when it
 *  does not, so ordinary notes render exactly as they always have. */
export function hasBullets(text: string | null | undefined): boolean {
  return (text ?? "").split("\n").some((line) => BULLET.test(line));
}

// Build a tree from a flat list of (level, text) by nesting each item under the
// nearest preceding item of a shallower level.
function buildTree(flat: { level: number; text: string }[]): BulletItem[] {
  const root: BulletItem[] = [];
  const stack: { level: number; item: BulletItem }[] = [];
  for (const { level, text } of flat) {
    const item: BulletItem = { text, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length === 0) root.push(item);
    else stack[stack.length - 1].item.children.push(item);
    stack.push({ level, item });
  }
  return root;
}

/** Split notes into text paragraphs and (nested) bullet lists, in order. */
export function parseNoteBlocks(text: string | null | undefined): NoteBlock[] {
  const lines = (text ?? "").split("\n");
  const blocks: NoteBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (BULLET.test(lines[i])) {
      const flat: { level: number; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(BULLET);
        if (!m) break;
        flat.push({ level: indentUnits(m[1]), text: m[3] });
        i += 1;
      }
      blocks.push({ kind: "list", items: buildTree(flat) });
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
