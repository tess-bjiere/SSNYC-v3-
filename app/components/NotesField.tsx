"use client";

import { useRef } from "react";

// A notes textarea that helps you write bullet lists (Tess, 2026-08-24: "the
// bullets are not intuitive to use — i need to be able to do bullets and sub
// bullets"). Three behaviours, the ones people expect from any editor:
//
//   • Bullet button (or typing "- ") turns the current line into a bullet.
//   • Enter on a bullet starts the next bullet at the same indent; Enter on an
//     empty bullet ends the list.
//   • Tab indents the line (a sub-bullet); Shift+Tab outdents.
//
// The MARKER follows the level (Tess, 2026-08-24: "sub bullets should be indented
// further and with dashes"): the top level is a dot, every level under it is a
// dash. Tab both indents the line and swaps its marker, so what you type already
// reads as the outline it renders into (lib/noteBlocks.ts + Linked draw the
// nested list; the dash markers and the deeper hang are the .linked-list CSS).
//
// It stays an ordinary uncontrolled <textarea name=…> under the hood, so it posts
// through the server-action forms exactly like the plain textareas it replaces —
// the key handling just rewrites the value in place.

const INDENT = "  "; // two spaces per level, matched by lib/noteBlocks indentUnits
const BULLET_RE = /^([ \t]*)([-*•])([ \t]+)(.*)$/;
const TOP = "• "; // the top level
const SUB = "- "; // every level under it — a dash the note parser also accepts

/** The indent depth of some leading whitespace — one tab, or two spaces, per
 *  level. The same rule lib/noteBlocks.indentUnits uses, so the editor and the
 *  renderer always agree on which level a line is. */
function levelOf(ws: string): number {
  let cols = 0;
  for (const ch of ws) cols += ch === "\t" ? 2 : 1;
  return Math.floor(cols / 2);
}

/** The marker a bullet at this depth wears: a dot at the top, a dash below. */
function markerFor(level: number): string {
  return level >= 1 ? SUB : TOP;
}

/** Rewrite every bullet line's marker to the one its indent calls for, so an
 *  existing note — dots and dashes mixed however it was typed — shows the tidy
 *  dot/dash outline in the box. A non-bullet line, and a dash inside prose, are
 *  left alone. */
function normalizeBullets(s: string): string {
  return s
    .split("\n")
    .map((l) => {
      const m = l.match(BULLET_RE);
      if (!m) return l;
      return m[1] + markerFor(levelOf(m[1])) + m[4];
    })
    .join("\n");
}

/** Drop one indent level off the front of some leading whitespace. */
function outdentWs(ws: string): string {
  if (ws.startsWith("\t")) return ws.slice(1);
  if (ws.startsWith(INDENT)) return ws.slice(INDENT.length);
  return ws.slice(Math.min(ws.length, INDENT.length));
}

export default function NotesField({
  name,
  defaultValue,
  placeholder,
  rows = 3,
  className = "textarea",
  "aria-label": ariaLabel,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function lineBounds(el: HTMLTextAreaElement, pos: number) {
    const start = el.value.lastIndexOf("\n", pos - 1) + 1;
    const nl = el.value.indexOf("\n", pos);
    const end = nl === -1 ? el.value.length : nl;
    return { start, end, line: el.value.slice(start, end) };
  }
  function apply(el: HTMLTextAreaElement, next: string, caret: number) {
    el.value = next;
    el.setSelectionRange(caret, caret);
    el.focus();
  }

  /** Re-indent a bullet line to a new leading whitespace, swapping its marker to
   *  match the new depth and keeping the caret at the same spot in the text. */
  function reindentBullet(
    el: HTMLTextAreaElement,
    start: number,
    end: number,
    m: RegExpMatchArray,
    pos: number,
    newWs: string,
  ) {
    const marker = markerFor(levelOf(newWs));
    const newLine = newWs + marker + m[4];
    const prefixLen = m[1].length + m[2].length + m[3].length;
    const textOffset = Math.min(Math.max(pos - start - prefixLen, 0), m[4].length);
    const caret = start + newWs.length + marker.length + textOffset;
    apply(el, el.value.slice(0, start) + newLine + el.value.slice(end), caret);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;

    if (e.key === "Enter" && !e.shiftKey && pos === el.selectionEnd) {
      const { start, end, line } = lineBounds(el, pos);
      const m = line.match(BULLET_RE);
      if (!m) return; // ordinary newline
      e.preventDefault();
      if (m[4].trim() === "") {
        // Empty bullet → drop the marker and its indent, ending the list.
        apply(el, el.value.slice(0, start) + el.value.slice(end), start);
      } else {
        // Continue at the same indent, with the marker that indent calls for.
        const insert = "\n" + m[1] + markerFor(levelOf(m[1]));
        apply(el, el.value.slice(0, pos) + insert + el.value.slice(pos), pos + insert.length);
      }
      return;
    }

    // Typing a marker + space at the head of a line becomes the level's marker
    // (the autoformat people expect), so what is typed matches the outline.
    if (e.key === " " && pos === el.selectionEnd) {
      const { start } = lineBounds(el, pos);
      const before = el.value.slice(start, pos);
      const mm = before.match(/^([ \t]*)[-*•]$/);
      if (mm) {
        e.preventDefault();
        const insert = mm[1] + markerFor(levelOf(mm[1]));
        apply(el, el.value.slice(0, start) + insert + el.value.slice(pos), start + insert.length);
        return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const { start, end, line } = lineBounds(el, pos);
      const m = line.match(BULLET_RE);
      const ws = m ? m[1] : line.match(/^[ \t]*/)?.[0] ?? "";
      if (e.shiftKey) {
        if (!ws) return; // already at the left margin
        const newWs = outdentWs(ws);
        if (m) {
          reindentBullet(el, start, end, m, pos, newWs);
        } else {
          const remove = ws.length - newWs.length;
          apply(el, el.value.slice(0, start + newWs.length) + el.value.slice(start + ws.length), Math.max(start, pos - remove));
        }
      } else {
        const newWs = ws + INDENT;
        if (m) {
          reindentBullet(el, start, end, m, pos, newWs);
        } else {
          apply(el, el.value.slice(0, start) + INDENT + el.value.slice(start), pos + INDENT.length);
        }
      }
      return;
    }
  }

  function toggleBullet() {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const { start, end, line } = lineBounds(el, pos);
    const m = line.match(BULLET_RE);
    let nextLine: string;
    let caret: number;
    if (m) {
      nextLine = m[1] + m[4]; // strip the marker, keep indent + text
      caret = Math.max(start, pos - (m[2].length + m[3].length));
    } else {
      const ws = line.match(/^[ \t]*/)?.[0] ?? "";
      const marker = markerFor(levelOf(ws));
      nextLine = ws + marker + line.slice(ws.length);
      caret = pos + marker.length;
    }
    apply(el, el.value.slice(0, start) + nextLine + el.value.slice(end), caret);
  }

  return (
    <div className="notes-field">
      <div className="notes-toolbar">
        <button
          type="button"
          className="ph-link"
          title="Make this line a bullet — or type “- ”. Tab indents to a dashed sub-bullet, Shift+Tab outdents."
          onClick={toggleBullet}
        >
          • Bullet
        </button>
        <span className="notes-hint">Enter continues · Tab indents for a sub-bullet</span>
      </div>
      <textarea
        ref={ref}
        className={className}
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={normalizeBullets(defaultValue ?? "")}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
