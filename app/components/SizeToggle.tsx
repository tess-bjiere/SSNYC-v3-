"use client";

// The image-size control, shared by the References grid and the Moodboard so the
// two read identically (Tess, 2026-08-11: "reference library and moodboard have
// different ways to show the options for those. Should be uniform buttons /
// icons"). It used to be grid-density icons in one place and text S/M/L in the
// other; now it is one component, drawn as a density icon in both.
//
// Three steps — smaller / medium / larger. On phone and tablet these map to 4,
// 2 and 1 columns; the icon is a relative density mark, not a literal count.

const STEPS = [
  ["sm", 4, "Smaller"],
  ["md", 3, "Medium"],
  ["lg", 2, "Larger"],
] as const;

function GridIcon({ n }: { n: number }) {
  const gap = 1.4;
  const total = 14;
  const s = (total - (n - 1) * gap) / n;
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      cells.push(
        <rect key={`${x}-${y}`} x={x * (s + gap)} y={y * (s + gap)} width={s} height={s} rx={0.5} fill="currentColor" />
      );
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      {cells}
    </svg>
  );
}

export default function SizeToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="dens" role="group" aria-label="Image size" title="Image size">
      {STEPS.map(([k, n, label]) => (
        <button
          key={k}
          type="button"
          className={"dens-btn" + (value === k ? " active" : "")}
          onClick={() => onChange(k)}
          title={label}
          aria-label={label}
          aria-pressed={value === k}
        >
          <GridIcon n={n} />
        </button>
      ))}
    </div>
  );
}
