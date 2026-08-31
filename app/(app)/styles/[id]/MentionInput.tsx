"use client";

import { useRef, useState } from "react";
import { localPart } from "@/lib/mentions";

// The @-mention typeahead for the comment box (Tess, 2026-08-28: "yes build
// @mentions", @ typeahead). An uncontrolled textarea/input — the value lives in
// the DOM so the existing server-action form submits and clears exactly as it
// did before — with a dropdown of teammates that appears while you are typing an
// "@token". Picking one splices "@local " into the text; on submit the server
// resolves those tokens and notifies the people (lib/mentions, lib/notify).

type Roster = { email: string; local: string };

export default function MentionInput({
  team,
  multiline = false,
  name,
  placeholder,
  className,
  required,
  autoFocus,
  minHeight,
}: {
  team: string[];
  multiline?: boolean;
  name: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
  minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const token = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Roster[]>([]);
  const [active, setActive] = useState(0);

  const roster: Roster[] = team
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"))
    .map((email) => ({ email, local: localPart(email) }));

  function refresh() {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    // The token is an "@" at a word boundary, then non-space, non-@ chars up to
    // the caret. The boundary stops an email in running text from triggering it.
    const m = /(?:^|\s)@([^\s@]*)$/.exec(el.value.slice(0, pos));
    if (!m) {
      setOpen(false);
      return;
    }
    const q = m[1].toLowerCase();
    token.current = { start: pos - m[1].length - 1, end: pos };
    const found = roster
      .filter((r) => r.local.includes(q) || r.email.includes(q))
      .slice(0, 6);
    setMatches(found);
    setActive(0);
    setOpen(found.length > 0);
  }

  function accept(m: Roster) {
    const el = ref.current;
    if (!el) return;
    const { start, end } = token.current;
    const insert = `@${m.local} `;
    el.value = el.value.slice(0, start) + insert + el.value.slice(end);
    const caret = start + insert.length;
    el.setSelectionRange(caret, caret);
    setOpen(false);
    el.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const shared = {
    ref,
    name,
    className,
    placeholder,
    required,
    autoFocus,
    autoComplete: "off",
    onInput: refresh,
    onKeyUp: refresh,
    onClick: refresh,
    onKeyDown,
    // A click lands before the input blurs, so the menu is still there to pick.
    onBlur: () => setTimeout(() => setOpen(false), 120),
  } as const;

  return (
    <div className="mention-wrap">
      {multiline ? (
        <textarea {...shared} style={minHeight ? { minHeight } : undefined} />
      ) : (
        <input {...shared} />
      )}
      {open && (
        <ul className="mention-menu" role="listbox">
          {matches.map((m, i) => (
            <li
              key={m.email}
              role="option"
              aria-selected={i === active}
              className={`mention-opt${i === active ? " is-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(m);
              }}
            >
              <b>@{m.local}</b>
              <span className="mention-email">{m.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
