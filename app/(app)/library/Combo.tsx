"use client";

import { useEffect, useRef, useState } from "react";

// Styled autocomplete that matches the site (dark panel, site fonts) instead of
// the browser's native <datalist> popup. Filters the curated list values as you
// type, click or keyboard to pick, and free text is still allowed. Shared by the
// Add-reference form (UploadModal) and the reference Edit form (DetailModal) so a
// field offers the same options wherever it is filled in (Tess, 2026-08-12: "add
// dropdown options for fields when editing").
export default function Combo({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const matches = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 12);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="combo" ref={boxRef}>
      <input
        className="input"
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") { setOpen(true); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && active >= 0 && matches[active]) { e.preventDefault(); choose(matches[active]); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
      />
      {open && matches.length > 0 && (
        <div className="combo-menu">
          {matches.map((m, i) => (
            <div
              key={m}
              className={"combo-opt" + (i === active ? " active" : "")}
              onMouseDown={(e) => { e.preventDefault(); choose(m); }}
              onMouseEnter={() => setActive(i)}
            >
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
