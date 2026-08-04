// Grouping styles by the factory that is actually making them (P3 #41).
//
// The question this answers is the one asked on a call with a factory: "what do
// you have of ours right now, and where is each of it?" That is not the same as
// styles.factory. A style's factory field is where it is *meant* to be made; the
// round is where it actually went, and a season regularly moves — proto1 at one
// factory, SMS at another. So the factory of a round is the round's own factory
// when it has one, and the style's only as a fallback.
//
// Dependency-free on purpose: unit-tested directly by node's test runner. The
// date arithmetic and state words live in lib/sampleCycle.ts and are applied by
// the page, not here — this file only decides who owns what.

export type FactoryStyleLike = {
  id: string;
  name?: string | null;
  style_no?: string | null;
  status?: string | null;
  factory?: string | null;
};

export type FactoryRoundLike = {
  id: string;
  style_id: string;
  round?: string | null;
  factory?: string | null;
  submitted_date?: string | null;
  received_date?: string | null;
  created_at?: string | null;
};

/** Rounds with no factory anywhere have to go somewhere visible, not nowhere. */
export const UNASSIGNED = "Unassigned";

function clean(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Two people typing the same factory will not type it the same way. "Jiaxing",
 * "jiaxing " and "JIAXING" are one factory; the first spelling seen is the one
 * displayed, so the list reads the way the team writes rather than lower-cased.
 */
export function factoryKey(name: string | null | undefined): string {
  return clean(name).toLowerCase().replace(/\s+/g, " ");
}

/** The factory a round belongs to: its own, else the style's, else Unassigned. */
export function factoryOf(round: FactoryRoundLike, style: FactoryStyleLike | undefined): string {
  return clean(round.factory) || clean(style?.factory) || UNASSIGNED;
}

/**
 * The round that matters now: the first one not yet back. Rounds must arrive in
 * cycle order (sortSamples), so "first not back" is the earliest unfinished leg
 * rather than whichever row was edited last. When everything is back, the last
 * round is the current one — the style is between rounds, not idle forever.
 */
export function openRound<T extends FactoryRoundLike>(rounds: readonly T[]): T | null {
  if (rounds.length === 0) return null;
  for (const r of rounds) {
    if (!clean(r.received_date)) return r;
  }
  return rounds[rounds.length - 1];
}

export type FactoryStyleRow<S extends FactoryStyleLike, R extends FactoryRoundLike> = {
  style: S;
  /** This factory's rounds for this style, in the order they were passed in. */
  rounds: R[];
  /** The round to show on the row — see openRound. */
  open: R | null;
};

export type FactoryGroup<S extends FactoryStyleLike, R extends FactoryRoundLike> = {
  /** Display spelling — the first one encountered. */
  name: string;
  key: string;
  styles: FactoryStyleRow<S, R>[];
  /** Rounds this factory is holding, i.e. submitted and not yet back. */
  openCount: number;
};

/**
 * Group rounds by factory, then by style.
 *
 * `rounds` must already be in cycle order — the page passes
 * sortSamples(rows, SAMPLE_ROUNDS). Insertion order is not reliable: rounds
 * logged in one sitting share a created_at and Postgres may return tied rows in
 * any order, which changes as soon as one of them is edited.
 *
 * A style appears under every factory that has a round of it, which is the point
 * — a style split across two factories should read as work at both.
 */
export function groupByFactory<S extends FactoryStyleLike, R extends FactoryRoundLike>(
  styles: readonly S[],
  rounds: readonly R[]
): FactoryGroup<S, R>[] {
  const byId = new Map<string, S>();
  for (const s of styles) byId.set(s.id, s);

  const groups = new Map<string, FactoryGroup<S, R>>();
  const perGroupStyles = new Map<string, Map<string, FactoryStyleRow<S, R>>>();

  for (const r of rounds) {
    const style = byId.get(r.style_id);
    if (!style) continue; // an orphaned round belongs to no factory's workload
    const name = factoryOf(r, style);
    const key = factoryKey(name);

    let g = groups.get(key);
    if (!g) {
      g = { name, key, styles: [], openCount: 0 };
      groups.set(key, g);
      perGroupStyles.set(key, new Map());
    }

    const rowsFor = perGroupStyles.get(key)!;
    let row = rowsFor.get(style.id);
    if (!row) {
      row = { style, rounds: [], open: null };
      rowsFor.set(style.id, row);
      g.styles.push(row);
    }
    row.rounds.push(r);

    if (clean(r.submitted_date) && !clean(r.received_date)) g.openCount += 1;
  }

  for (const g of groups.values()) {
    for (const row of g.styles) row.open = openRound(row.rounds);
    g.styles.sort((a, b) =>
      clean(a.style.name).localeCompare(clean(b.style.name), "en", { sensitivity: "base" })
    );
  }

  return [...groups.values()].sort((a, b) => {
    // Unassigned is a to-do list, not a factory — it sits at the bottom.
    const au = a.key === factoryKey(UNASSIGNED) ? 1 : 0;
    const bu = b.key === factoryKey(UNASSIGNED) ? 1 : 0;
    if (au !== bu) return au - bu;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}
