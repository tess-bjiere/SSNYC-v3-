// Rich notes — the bridge between a stored note and the TipTap editor (Tess,
// 2026-08-24: "go with TipTap"). The plain-text-with-bullets notes proved too
// fragile (invisible leading spaces decided nesting, and the rendering leaned on
// CSS list-marker tricks that cached badly), so notes are now authored in a
// WYSIWYG editor and STORED AS TIPTAP JSON in the same text columns.
//
// This module is the pure, dependency-free half so the conversions can be
// unit-tested: it detects which of the two shapes a stored value is, turns an
// old plain-text note INTO a doc (so it opens cleanly in the editor), and turns a
// doc back into plain text (so exports, the CSV and any plain context stay
// readable). The React pieces — the editor and the renderer — live in
// app/components and import from here.
//
// Backward compatibility is the whole point: every note ever written is plain
// text, and must keep rendering and keep being editable. A value is a doc only
// when it parses as one; anything else is treated as the plain text it has always
// been.
//
// Dependency-free like the rest of lib: it does NOT import lib/noteBlocks (which
// would break the node test runner's resolution). Instead `blocksToDoc` takes the
// parsed blocks as an argument — the same injection lib/zip uses for inflate — so
// the caller (a component, which may import noteBlocks freely) parses the text and
// hands the blocks in. The structural types below mirror lib/noteBlocks' output.

/** Mirrors lib/noteBlocks BulletItem — a bullet and its (nested) children. */
export type BulletItemLike = { text: string; children: BulletItemLike[] };
/** Mirrors lib/noteBlocks NoteBlock — a text paragraph run or a bullet list. */
export type NoteBlockLike =
  | { kind: "text"; text: string }
  | { kind: "list"; items: BulletItemLike[] };

/** A TipTap node — only the parts these conversions read are typed. */
export type RichMark = { type: string; attrs?: Record<string, unknown> };
export type RichNode = {
  type: string;
  text?: string;
  marks?: RichMark[];
  content?: RichNode[];
};
export type RichDoc = { type: "doc"; content: RichNode[] };

/** The stored value as a TipTap doc, or null when it is plain text. A note only
 *  counts as rich when it genuinely parses as a `doc` — never a guess. */
export function parseRich(value: string | null | undefined): RichDoc | null {
  const s = (value ?? "").trim();
  // A plain note never starts with "{", so the parse is skipped for the common case.
  if (!s.startsWith("{")) return null;
  try {
    const o = JSON.parse(s) as unknown;
    if (
      o &&
      typeof o === "object" &&
      (o as RichNode).type === "doc" &&
      Array.isArray((o as RichNode).content)
    ) {
      return o as RichDoc;
    }
  } catch {
    /* not JSON — it is plain text */
  }
  return null;
}

/** Whether a stored value is a rich doc rather than plain text. */
export function isRich(value: string | null | undefined): boolean {
  return parseRich(value) !== null;
}

/** All the text inside a node, marks flattened away. */
function textOf(node: RichNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

const LIST_TYPES = new Set(["bulletList", "orderedList"]);

function walkToLines(nodes: RichNode[] | undefined, depth: number, out: string[]): void {
  for (const n of nodes ?? []) {
    if (LIST_TYPES.has(n.type)) {
      for (const li of n.content ?? []) {
        // A listItem holds its own paragraph (the item's text) and optionally
        // nested lists. The marker follows the depth — a dot at the top, a dash
        // below — and two spaces per level, so the output round-trips back through
        // parseNoteBlocks unchanged.
        const para = (li.content ?? []).find((c) => c.type === "paragraph");
        const marker = depth === 0 ? "• " : "- ";
        out.push("  ".repeat(depth) + marker + textOf(para).trim());
        walkToLines(
          (li.content ?? []).filter((c) => LIST_TYPES.has(c.type)),
          depth + 1,
          out
        );
      }
    } else if (n.type === "paragraph") {
      out.push(textOf(n));
    } else if (n.content) {
      walkToLines(n.content, depth, out);
    }
  }
}

/**
 * A stored note as plain text — for exports, the CSV, and anywhere that renders
 * a note as a string rather than markup. A rich doc is flattened to the same
 * bulleted text a person would have typed; a value that is already plain text is
 * returned untouched. Safe to call on either shape.
 */
export function docToText(value: string | null | undefined): string {
  const doc = parseRich(value);
  if (!doc) return value ?? "";
  const out: string[] = [];
  walkToLines(doc.content, 0, out);
  return out.join("\n");
}

function paragraph(text: string): RichNode {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function bulletList(items: BulletItemLike[]): RichNode {
  return {
    type: "bulletList",
    content: items.map((it) => ({
      type: "listItem",
      content: [
        paragraph(it.text),
        ...(it.children.length > 0 ? [bulletList(it.children)] : []),
      ],
    })),
  };
}

/**
 * An old plain-text note as a TipTap doc, so it opens in the editor as the list
 * and paragraphs it reads as. Takes the note's parsed blocks (from
 * lib/noteBlocks.parseNoteBlocks, called by the component) so this module stays
 * dependency-free — the doc looks identical to how the plain renderer drew it.
 */
export function blocksToDoc(blocks: NoteBlockLike[]): RichDoc {
  const content: RichNode[] = [];
  for (const b of blocks) {
    if (b.kind === "text") {
      for (const line of b.text.split("\n")) content.push(paragraph(line));
    } else {
      content.push(bulletList(b.items));
    }
  }
  if (content.length === 0) content.push(paragraph(""));
  return { type: "doc", content };
}

/** True when a doc has no text at all — used to store "" instead of an empty doc,
 *  so a cleared note reads as empty everywhere, exactly like a blank textarea. */
export function isEmptyDoc(value: string | null | undefined): boolean {
  return docToText(value).trim() === "";
}
