// Reading a style's photography now that photography lives on the rounds.
//
// Tess, 2026-08-05: "photography should not be it's own section, it needs to
// live within the specific sample round."
//
// The five shoot slots used to be filled once per style. They are filled per
// round now, which means every place in the app that asked `styles.photos`
// "has this been shot?" would answer no for a garment photographed yesterday —
// the development grid would show a sketch forever, and the photography
// roll-out would list a finished style as untouched. That is not a cosmetic
// problem: it would send somebody to reshoot a garment that has already been
// shot.
//
// So the read sites merge. This module is the one place that decides how, and
// three pages call it rather than each writing the same four lines slightly
// differently:
//
//   - /photography       the studio-wide shot list
//   - /development       the grid thumbnail
//   - /styles/[id]/export the printed history
//
// Nothing here writes. It reads two maps and returns a third; the stored rows
// are untouched, and a style with no rounds resolves exactly as it did before
// any of this changed.
//
// Not dependency-free, and therefore deliberately untested in isolation: the
// decisions worth pinning — which round counts as latest, and what wins when
// both maps hold the same slot — live in lib/sampleCycle.ts and
// lib/styleCover.ts, which are both dependency-free and both covered.

import { latestSample } from "@/lib/sampleCycle";
import { withRoundPhotos } from "@/lib/styleCover";

type RoundRow = {
  style_id: string;
  round?: string | null;
  created_at?: string | null;
  photos?: unknown;
};

type StyleRow = { id: string; photos?: unknown };

/**
 * Each style's photo map with its latest round's map laid over it, keyed by
 * style id.
 *
 * The rounds are grouped once and the cycle order is applied per style, so this
 * is one pass over the rounds and one sort per style rather than a scan per
 * card. `order` is passed in for the same reason it is everywhere else: the
 * cycle is a fact about the studio, not about this function.
 */
export function latestRoundPhotosByStyle(
  rounds: readonly RoundRow[],
  order: readonly string[]
): Map<string, unknown> {
  const grouped = new Map<string, RoundRow[]>();
  for (const r of rounds) {
    if (!r || typeof r.style_id !== "string") continue;
    const list = grouped.get(r.style_id);
    if (list) list.push(r);
    else grouped.set(r.style_id, [r]);
  }

  const out = new Map<string, unknown>();
  for (const [styleId, list] of grouped) {
    const latest = latestSample(
      list.map((r) => ({ round: r.round ?? null, created_at: r.created_at ?? null, photos: r.photos })),
      order
    );
    if (latest) out.set(styleId, latest.photos);
  }
  return out;
}

/**
 * The same styles, each carrying the photo map the rest of the app should read.
 *
 * The returned rows are copies — nothing is mutated, so a caller that also
 * needs the raw stored map still has it. Only `photos` differs, and only where
 * a round supplied a slot the style did not; every shot filed on the style
 * before photography moved onto the rounds is still in the merged map, which is
 * what stops an old lay flat disappearing from the grid the day a round is
 * logged with no photographs on it yet.
 */
export function mergeLatestRoundPhotos<T extends StyleRow>(
  styles: readonly T[],
  rounds: readonly RoundRow[],
  order: readonly string[]
): T[] {
  const byStyle = latestRoundPhotosByStyle(rounds, order);
  return styles.map((s) => {
    const roundPhotos = byStyle.get(s.id);
    if (roundPhotos === undefined) return s;
    return { ...s, photos: withRoundPhotos(s, roundPhotos).photos };
  });
}
