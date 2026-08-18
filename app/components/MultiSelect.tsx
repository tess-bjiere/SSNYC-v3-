"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectOption } from "./Select";

// A multiple-choice sibling of Select (Tess, 2026-08-17: "Allow user to select
// multiple cities, countries when filtering photographers").
//
// It borrows Select's exact chrome — the same `.sel` / `.sel-trigger` /
// `.sel-menu` / `.sel-opt` the app already paints — so a row of these sits next
// to the single Selects without looking foreign. The only differences that
// matter: choosing an option toggles it into a set instead of replacing, the
// panel stays open while you pick, and each row carries a check box so the
// chosen ones are obvious. No native dialog, closed by Escape or an outside
// click, per the standing rule.
export default function MultiSelect({
  options,
  values,
  onChange,
  className = "",
  placeholder = "—",
  allLabel,
  "aria-label": ariaLabel,
}: {
  options: SelectOption[];
  /** The chosen values. Empty = nothing picked (reads as the placeholder). */
  values: string[];
  onChange: (values: string[]) => void;
  className?: string;
  /** Button text when nothing is chosen. */
  placeholder?: string;
  /** Shown as the count noun, e.g. "cities" → "3 cities". */
  allLabel?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const set = useMemo(() => new Set(values), [values]);

  const label = useMemo(() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      return options.find((o) => o.value === values[0])?.label ?? values[0];
    }
    return `${values.length} ${allLabel ?? "selected"}`;
  }, [values, options, placeholder, allLabel]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(v: string) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    // Keep the caller's option order rather than Set insertion order.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  }

  return (
    <div className={"sel" + (open ? " is-open" : "")} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={"sel-trigger " + className}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={"sel-label" + (values.length ? "" : " is-placeholder")}>{label}</span>
      </button>

      {open && (
        <ul className="sel-menu" role="listbox" aria-multiselectable="true" tabIndex={-1}>
          {options.map((o, i) => {
            const on = set.has(o.value);
            return (
              <li
                key={o.value + i}
                role="option"
                aria-selected={on}
                className={"sel-opt ms-opt" + (on ? " on" : "")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggle(o.value);
                }}
              >
                <span className="ms-check" aria-hidden="true">{on ? "✓" : ""}</span>
                {o.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
