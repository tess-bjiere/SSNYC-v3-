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
// It stays an ordinary uncontrolled <textarea name=…> under the hood, so it posts
// through the server-action forms exactly like the plain textareas it replaces —
// the key handling just rewrites the value in place. The rendering of what gets
// typed is lib/noteBlocks.ts + Linked.

const INDENT = "  "; // two spaces per level, matched by lib/noteBlocks indentUnits
const BULLET_RE = /^([ \t]*)([-*•])([ \t]+)(.*)$/;
// One marker, everywhere (Tess, 2026-08-24: "the bullet functionality is not
// creating bullets consistently it's doing dashes and looks messy"). The button,
// Enter-continue and a typed "- " all resolve to this, and any -/* already in a
// note is shown as this in the box, so a list never mixes dashes and dots.
const MARK = "• ";

/** Show every bullet marker as the dot, whatever it was typed as. Only a real
 *  marker — a -,*, or • at the start of the line followed by a space — is
 *  touched, so a dash inside prose ("well-made") or a leading minus ("-5°") is
 *  left alone. */
function normalizeBullets(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/^([ \t]*)[-*•]([ \t])/, "$1•$2"))
    .join("\n");
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
        // Continue with the dot, at the same indent — never inherit a dash the
        // line happened to be typed with.
        const insert = "\n" + m[1] + MARK;
        apply(el, el.value.slice(0, pos) + insert + el.value.slice(pos), pos + insert.length);
      }
      return;
    }

    // Typing "- " or "* " at the head of a line becomes "• " (the autoformat
    // people expect from a bulleting editor), so a dash never survives to render.
    if (e.key === " " && pos === el.selectionEnd) {
      const { start } = lineBounds(el, pos);
      const before = el.value.slice(start, pos);
      const mm = before.match(/^([ \t]*)[-*•]$/);
      if (mm) {
        e.preventDefault();
        const insert = mm[1] + MARK;
        apply(el, el.value.slice(0, start) + insert + el.value.slice(pos), start + insert.length);
        return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const { start, line } = lineBounds(el, pos);
      const ws = line.match(/^[ \t]*/)?.[0] ?? "";
      if (e.shiftKey) {
        const remove = ws.startsWith("\t") ? 1 : ws.startsWith(INDENT) ? INDENT.length : Math.min(ws.length, INDENT.length);
        if (remove > 0) {
          apply(el, el.value.slice(0, start) + el.value.slice(start + remove), Math.max(start, pos - remove));
        }
      } else {
        apply(el, el.value.slice(0, start) + INDENT + el.value.slice(start), pos + INDENT.length);
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
      nextLine = ws + MARK + line.slice(ws.length);
      caret = pos + MARK.length;
    }
    apply(el, el.value.slice(0, start) + nextLine + el.value.slice(end), caret);
  }

  return (
    <div className="notes-field">
      <div className="notes-toolbar">
        <button
          type="button"
          className="ph-link"
          title="Make this line a bullet — or type “- ”. Tab indents, Shift+Tab outdents."
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
