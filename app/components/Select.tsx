"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

// A dropdown that belongs to this app.
//
// Tess, 2026-08-06: "Update all dropdowns to match app style not be native os".
//
// The closed control has looked right for a long time — `.select` in
// globals.css already paints the field, the hairline and the chevron. What
// never matched is the part you only see after you click: the OPEN list is
// drawn by the operating system, so on a Mac it is a white rounded popover with
// blue highlights and system type, landing on top of a dark studio tool. There
// is no CSS that fixes that; a native <select>'s popup is not stylable. The
// only way to make the open state match is to stop using one.
//
// So this is a listbox: a button that looks exactly like the old field, and a
// panel of options drawn in the app's own panel colour with the app's own type.
// It is deliberately the same shape as the existing combo in UploadModal.tsx.
//
// Three things it must not lose, because the old <select> gave them away free:
//
//   Forms. Half the dropdowns in here sit inside a server-action form and are
//   read by name off the FormData. So when `name` is given this renders a real
//   <input> carrying the value, and every one of those forms posts exactly the
//   field it posted before. Nothing on the server changed.
//
//   Required. That input is a text input rather than type=hidden, because
//   hidden inputs are excluded from constraint validation and the "Add sample
//   round" form genuinely requires a round. It is invisible but one pixel tall
//   and positioned over the control, so the browser's own "please fill this in"
//   bubble still points at the right place.
//
//   Keyboard. Enter, Space or Down opens; Up/Down/Home/End move; Enter or Space
//   chooses; Escape closes and puts focus back on the button; typing a letter
//   jumps to the next option starting with it. Tab is left alone — it closes
//   the menu and moves on, which is what people expect from a field.
//
// NO native dialogs anywhere near this, per the standing rule: it is a plain
// absolutely-positioned panel, closed by Escape, by a click elsewhere, or by
// choosing something.

export type SelectOption = {
  value: string;
  label: string;
  /** Shown, unchoosable. Used for the "Select…" placeholder row. */
  disabled?: boolean;
};

export default function Select({
  options,
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  className = "",
  placeholder = "—",
  id,
  "aria-label": ariaLabel,
  title,
}: {
  options: SelectOption[];
  /** Controlled value. Leave undefined and pass defaultValue to run uncontrolled. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Post under this name. Omit for a control that only drives client state. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  /** Goes on the button, so every existing `.select sm` / `.lib-sort` still lands. */
  className?: string;
  /** What the button reads when nothing is chosen and no option matches. */
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  title?: string;
}) {
  const uid = useId();
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = controlled ? (value as string) : inner;

  const [open, setOpen] = useState(false);
  // Which row the keyboard is on. -1 while the mouse is driving.
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  // For type-to-jump. A ref, not state: it must not cause a render.
  const typed = useRef({ text: "", at: 0 });

  const choosable = useMemo(() => options.filter((o) => !o.disabled), [options]);
  const label = useMemo(() => {
    const hit = options.find((o) => o.value === current);
    // An option that has since disappeared still shows its stored value rather
    // than silently reading as empty — a round typed before the list existed is
    // a real answer, not a blank one.
    if (hit) return hit.label;
    return current || placeholder;
  }, [options, current, placeholder]);

  const choose = useCallback(
    (v: string) => {
      if (!controlled) setInner(v);
      onChange?.(v);
      setOpen(false);
      setActive(-1);
      // Focus goes back where the click came from, so the next Tab carries on
      // from the field rather than from the top of the document.
      btnRef.current?.focus();
    },
    [controlled, onChange]
  );

  // Close on a click anywhere else, and on scroll of an ancestor — the panel is
  // absolutely positioned, so a scroll would otherwise leave it behind.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Open with the current option under the keyboard, and keep it in view.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === current && !o.disabled);
    setActive(idx >= 0 ? idx : options.findIndex((o) => !o.disabled));
  }, [open, options, current]);

  useEffect(() => {
    if (!open || active < 0) return;
    const el = menuRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function step(dir: 1 | -1) {
    if (!options.length) return;
    let i = active;
    for (let n = 0; n < options.length; n += 1) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const list = e.key === "Home" ? options : [...options].reverse();
      const hit = list.find((o) => !o.disabled);
      if (hit) setActive(options.indexOf(hit));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[active];
      if (o && !o.disabled) choose(o.value);
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-to-jump. Letters typed within a second of each other build a
      // prefix, so "pro" lands on Proto rather than bouncing p → r → o.
      const now = Date.now();
      typed.current.text = now - typed.current.at < 1000 ? typed.current.text + e.key : e.key;
      typed.current.at = now;
      const want = typed.current.text.toLowerCase();
      const hit = choosable.find((o) => o.label.toLowerCase().startsWith(want));
      if (hit) setActive(options.indexOf(hit));
    }
  }

  const listId = `${uid}-list`;

  return (
    <div className={"sel" + (disabled ? " is-disabled" : "")} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        id={id}
        className={"sel-trigger " + className}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className={"sel-label" + (current ? "" : " is-placeholder")}>{label}</span>
      </button>

      {/* The value the form posts. Real input, not type=hidden, so `required`
          is actually enforced — see the note at the top of this file. */}
      {name && (
        <input
          className="sel-value"
          name={name}
          value={current}
          required={required}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          onChange={() => {}}
          onFocus={() => btnRef.current?.focus()}
        />
      )}

      {open && (
        <ul className="sel-menu" role="listbox" id={listId} ref={menuRef} tabIndex={-1}>
          {options.map((o, i) => (
            <li
              key={o.value + i}
              data-i={i}
              role="option"
              aria-selected={o.value === current}
              aria-disabled={o.disabled || undefined}
              className={
                "sel-opt" +
                (i === active ? " active" : "") +
                (o.value === current ? " on" : "") +
                (o.disabled ? " off" : "")
              }
              onMouseEnter={() => !o.disabled && setActive(i)}
              onMouseDown={(e) => {
                // mousedown, not click: the outside-click listener runs on
                // mousedown, and a click handler would fire after the panel had
                // already been told to close.
                e.preventDefault();
                if (!o.disabled) choose(o.value);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
