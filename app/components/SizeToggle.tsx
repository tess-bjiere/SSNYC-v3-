"use client";

// The image-size control, shared by the References grid and the Moodboard so the
// two read identically (Tess, 2026-08-11: "reference library and moodboard have
// different ways to show the options for those. Should be uniform buttons /
// icons"). It used to be grid-density icons in one place and text S/M/L in the
// other; now it is one component, drawn as a density icon in both.
//
// Three steps, drawn to match the reference design's column icons exactly (Tess,
// 2026-08-11: "column icons across app on all breakpoints should all match style
// of the reference design"): sharp-cornered filled squares on a 16 grid, and
// ordered larger → smaller left to right (2×2, 3×3, 4×4), the way the reference
// reads. The values (sm/md/lg) still drive .grid.dens-* — only the order and the
// glyph changed.
const STEPS = [
  ["lg", 2, "Larger"],
  ["md", 3, "Medium"],
  ["sm", 4, "Smaller"],
] as const;

// Per-grid geometry lifted from the reference SVGs so the marks are identical.
const GEO: Record<number, { c: number; gap: number; p: number }> = {
  2: { c: 4.5, gap: 2, p: 2.5 },
  3: { c: 3, gap: 1.5, p: 2 },
  4: { c: 2, gap: 1.3, p: 2 },
};

function GridIcon({ n }: { n: number }) {
  const g = GEO[n];
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={g.p + x * (g.c + g.gap)}
          y={g.p + y * (g.c + g.gap)}
          width={g.c}
          height={g.c}
          fill="currentColor"
        />
      );
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
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
