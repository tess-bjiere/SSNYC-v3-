// Rolling the photography standard out across the whole library (P5).
//
// P3 put the five-slot standard on a style profile. That made each style
// answerable one at a time, which is not how the shooting actually happens: a
// day in the studio is a *list* of garments, and the question the person
// holding the camera is asking is "what do I still have to shoot", not "is this
// one style finished". So this module reads the standard across every style and
// turns it back into a list of work.
//
// Two views of the same data, because two people need it:
//   - the shot list, ordered so a shooting day can be worked top to bottom
//   - the per-slot tally, which answers a different question — *which shot* is
//     the studio worst at. If forty styles are missing the same slot, that is
//     not forty oversights, it is a standard nobody has been told about.
//
// Nothing here writes. This is a reading of `styles.photos` and no more, so
// rolling the standard out cannot itself change a single stored row.
//
// Deliberately dependency-free (its own structural types, no imports) so node's
// test runner can load it directly — the slot list is passed in rather than
// imported, which also means a test can define three slots instead of five and
// pin the arithmetic without depending on today's standard.

export type RolloutSlot = { id: string; label: string };

export type RolloutStyle = {
  id: string;
  name: string;
  style_no?: string | null;
  season?: string | null;
  status?: string | null;
  evergreen?: boolean | null;
  cover_image?: string | null;
  photos?: Record<string, string> | null;
  updated_at?: string | null;
};

export type RolloutSlotState = RolloutSlot & { shot: boolean };

export type RolloutRow = {
  style: RolloutStyle;
  slots: RolloutSlotState[];
  filled: number;
  total: number;
  /** Slot ids still to shoot, in standard order. This is the row's shot list. */
  missing: string[];
  complete: boolean;
  /** Nothing at all yet — worth saying differently from "one left". */
  untouched: boolean;
};

export type RolloutView = "todo" | "complete" | "all";

export type SlotTally = RolloutSlot & { shot: number; missing: number };

export type RolloutSummary = {
  styles: number;
  complete: number;
  /** Individual photographs, not styles: the honest measure of work left. */
  shotsDone: number;
  shotsTotal: number;
  percent: number;
  bySlot: SlotTally[];
};

/** A stored photos map, read defensively: blank strings and junk are "absent". */
function shot(photos: RolloutStyle["photos"], slotId: string): boolean {
  if (!photos || typeof photos !== "object" || Array.isArray(photos)) return false;
  const v = (photos as Record<string, unknown>)[slotId];
  return typeof v === "string" && v.trim() !== "";
}

export function rowFor(style: RolloutStyle, slots: readonly RolloutSlot[]): RolloutRow {
  const states = slots.map((s) => ({ ...s, shot: shot(style.photos, s.id) }));
  const missing = states.filter((s) => !s.shot).map((s) => s.id);
  const total = states.length;
  const filled = total - missing.length;
  return {
    style,
    slots: states,
    filled,
    total,
    missing,
    complete: total > 0 && missing.length === 0,
    untouched: filled === 0,
  };
}

export function buildRollout(
  styles: readonly RolloutStyle[],
  slots: readonly RolloutSlot[]
): RolloutRow[] {
  return styles.map((s) => rowFor(s, slots));
}

/**
 * How urgent an unshot style is, by where it sits in the pipeline.
 *
 * A production style with no photography is a garment being made and sold with
 * nothing to show for it — that is the one that costs money. An inspo style
 * with no photography is not a problem at all; there is usually no garment yet.
 * Archived sorts last rather than being hidden here, because hiding is the
 * caller's decision and this function only ranks.
 */
export function statusWeight(status?: string | null): number {
  switch ((status ?? "").toLowerCase()) {
    case "production":
      return 0;
    case "development":
      return 1;
    case "inspo":
      return 2;
    case "archived":
      return 4;
    default:
      return 3;
  }
}

function byName(a: RolloutRow, b: RolloutRow): number {
  return a.style.name.localeCompare(b.style.name, undefined, { sensitivity: "base" });
}

/**
 * The order a shooting day is worked in.
 *
 * Pipeline urgency first, then *fewest missing first* — which looks backwards
 * until you have stood in a studio with a rail of samples. Two shots left is
 * twenty minutes and one more style off the list; five shots left is a setup, a
 * model and a booking. Clearing the nearly-done ones first is what makes the
 * list visibly shrink, and a list that visibly shrinks is a list that gets
 * worked. The all-five styles are still there tomorrow.
 *
 * Name breaks the final tie so the order is stable between two loads of the
 * page — a shot list that reshuffles itself while you are halfway down it is
 * worse than no shot list.
 */
export function sortShotList(rows: readonly RolloutRow[]): RolloutRow[] {
  return [...rows].sort((a, b) => {
    const w = statusWeight(a.style.status) - statusWeight(b.style.status);
    if (w !== 0) return w;
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    return byName(a, b);
  });
}

/** Finished styles, newest work first is meaningless here — name is kinder. */
export function sortComplete(rows: readonly RolloutRow[]): RolloutRow[] {
  return [...rows].sort(byName);
}

/**
 * Which rows a view shows.
 *
 * "todo" leaves archived styles out: an archived style is not going to be shot,
 * and a to-do list carrying work nobody intends to do is how people stop
 * trusting to-do lists. They are still reachable under "all", and they still
 * count in the tally, because the tally is a measurement rather than a plan.
 */
export function filterRollout(rows: readonly RolloutRow[], view: RolloutView): RolloutRow[] {
  if (view === "complete") return sortComplete(rows.filter((r) => r.complete));
  if (view === "all") return sortShotList(rows);
  return sortShotList(
    rows.filter((r) => !r.complete && (r.style.status ?? "").toLowerCase() !== "archived")
  );
}

export function summarize(
  rows: readonly RolloutRow[],
  slots: readonly RolloutSlot[]
): RolloutSummary {
  const bySlot: SlotTally[] = slots.map((s) => {
    const shotCount = rows.filter((r) => r.slots.some((x) => x.id === s.id && x.shot)).length;
    return { ...s, shot: shotCount, missing: rows.length - shotCount };
  });
  const shotsTotal = rows.length * slots.length;
  const shotsDone = rows.reduce((n, r) => n + r.filled, 0);
  return {
    styles: rows.length,
    complete: rows.filter((r) => r.complete).length,
    shotsDone,
    shotsTotal,
    // Round down, and never let an unfinished library round up to 100 — "100%"
    // beside remaining work is the fastest way to lose a person's trust in a
    // number.
    percent: shotsTotal === 0 ? 0 : Math.min(shotsDone === shotsTotal ? 100 : 99, Math.floor((shotsDone / shotsTotal) * 100)),
    bySlot,
  };
}

/** "Needs Model — back and Detail" — the row's own instruction, in words. */
export function shotListLine(row: RolloutRow): string {
  if (row.complete) return "Complete";
  const labels = row.slots.filter((s) => !s.shot).map((s) => s.label);
  if (labels.length === row.total) return "Nothing shot yet";
  if (labels.length === 1) return `Needs ${labels[0]}`;
  return `Needs ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The slot the studio should fix first, if there is a clear one.
 *
 * Only worth saying when a slot is meaningfully behind the others — otherwise
 * the page is inventing a finding out of noise. "Meaningfully" is: it is the
 * worst slot, at least a third of the library is missing it, and it is missing
 * on more styles than the best slot by a clear margin.
 */
export function worstSlot(summary: RolloutSummary): SlotTally | null {
  if (summary.styles === 0 || summary.bySlot.length < 2) return null;
  const ranked = [...summary.bySlot].sort((a, b) => b.missing - a.missing);
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];
  if (worst.missing < Math.ceil(summary.styles / 3)) return null;
  if (worst.missing - best.missing < 2) return null;
  return worst;
}
