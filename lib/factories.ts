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
  /** good | workable | poor, or nothing. See SAMPLE_RATINGS in lib/types.ts. */
  rating?: string | null;
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
  /** How the last judged round from THIS factory came out. See latestRating. */
  rating: string;
};

/**
 * The most recent rating among a factory's rounds of one style.
 *
 * Tess, 2026-08-07: "in the factory view, styles should have the color rating
 * next to them".
 *
 * Not the open round's rating: the round on the row is usually the one that has
 * not come back yet, and an unjudged round would blank the mark on exactly the
 * styles somebody is calling about. So it walks backwards to the last round
 * that was actually rated, which is the last thing this factory sent that
 * anybody has an opinion about.
 *
 * Rounds must arrive in cycle order, same as everywhere else in this file.
 *
 * Only this factory's rounds are considered. A style rated poor at one mill and
 * good at another is the normal case, and showing one factory the other's
 * verdict would be both wrong and, on a call, awkward.
 *
 * "" when nothing has been judged. The caller draws nothing rather than a grey
 * dot: any mark is read as a judgement, and "nobody has looked yet" is not one.
 */
export function latestRating(rounds: readonly FactoryRoundLike[]): string {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = clean(rounds[i]?.rating).toLowerCase();
    if (r) return r;
  }
  return "";
}

export type FactoryGroup<S extends FactoryStyleLike, R extends FactoryRoundLike> = {
  /** Display spelling — the first one encountered. */
  name: string;
  key: string;
  /** Live work. Archived styles are not in here. */
  styles: FactoryStyleRow<S, R>[];
  /**
   * Styles this factory has rounds of that have since been archived (Tess,
   * 2026-08-07: "If a style is archived it shouldnt show up under active styles
   * in the factory view -- it should show as archived").
   *
   * Kept rather than dropped, because a factory still physically has the sample
   * and somebody still has to decide what happens to it. What archiving changes
   * is that it stops being work — it should not be in the list you read down on
   * a call, and it should not be counted in what they owe you.
   */
  archived: FactoryStyleRow<S, R>[];
  /** Rounds this factory is holding, i.e. submitted and not yet back. */
  openCount: number;
};

/** The one status that takes a style out of the working list. */
export function isArchived(style: FactoryStyleLike | null | undefined): boolean {
  return clean(style?.status).toLowerCase() === "archived";
}

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
      g = { name, key, styles: [], archived: [], openCount: 0 };
      groups.set(key, g);
      perGroupStyles.set(key, new Map());
    }

    const rowsFor = perGroupStyles.get(key)!;
    let row = rowsFor.get(style.id);
    if (!row) {
      row = { style, rounds: [], open: null, rating: "" };
      rowsFor.set(style.id, row);
      (isArchived(style) ? g.archived : g.styles).push(row);
    }
    row.rounds.push(r);

    // An archived style's round is not outstanding. Counting it would put a
    // number on the tab for work nobody is waiting for, which is the number
    // people plan around.
    if (!isArchived(style) && clean(r.submitted_date) && !clean(r.received_date)) g.openCount += 1;
  }

  const byName = (a: FactoryStyleRow<S, R>, b: FactoryStyleRow<S, R>) =>
    clean(a.style.name).localeCompare(clean(b.style.name), "en", { sensitivity: "base" });

  for (const g of groups.values()) {
    for (const row of [...g.styles, ...g.archived]) {
      row.open = openRound(row.rounds);
      row.rating = latestRating(row.rounds);
    }
    g.styles.sort(byName);
    g.archived.sort(byName);
  }

  return [...groups.values()].sort((a, b) => {
    // Unassigned is a to-do list, not a factory — it sits at the bottom.
    const au = a.key === factoryKey(UNASSIGNED) ? 1 : 0;
    const bu = b.key === factoryKey(UNASSIGNED) ? 1 : 0;
    if (au !== bu) return au - bu;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}

// ---------------------------------------------------------------------------
// What a manager needs to see about one factory.
// ---------------------------------------------------------------------------
//
// Tess, 2026-08-07: "this isnt clear what dates they are sharing. What would be
// the most improtant quick view info for a manager to see when trying to
// understand what is happening at an individual factory -- quality, timelines,
// where they are in the sample process and overall logical alignemnt of
// information".
//
// The old row printed SENT and BACK as two small-caps labels floating at the
// right-hand end, with nothing saying which round they belonged to. On a style
// with four rounds behind it that is not a date, it is a riddle — and the row
// beside it might be showing dates from a different leg entirely.
//
// Four questions, in the order somebody actually asks them on a call:
//
//   1. What is with them RIGHT NOW, and how long has it been?  Everything else
//      is history. This is the only part that can still be acted on, so it
//      sorts first and sorts by how long it has been out.
//   2. What came back, and how fast?  A turnaround measured in days is the only
//      honest way to hold a factory to a schedule, and it is the number nobody
//      has because it lives across two columns of a spreadsheet.
//   3. How good is what they send?  The rating mix, counted — "mostly workable"
//      is a different factory from "half good, half poor".
//   4. Where is each style in the process?  Which round, and how many rounds it
//      has taken here, because a third proto at one factory is a different
//      story from a third proto that arrived after two at somebody else's.
//
// LATE IS MEASURED AGAINST THEMSELVES. There is no studio-wide "a proto takes
// three weeks" here, because it does not survive contact with a real season —
// a knit factory and a cut-and-sew factory are not late at the same number of
// days. A round is flagged when it has been out longer than this factory's own
// completed rounds have taken, which is a comparison the factory would accept.
// With fewer than two completed rounds nothing is flagged at all: one
// measurement is not an average and calling something late off it would be
// guessing with a red colour on.

export type FactoryPhase =
  /** Submitted and not yet back. The only phase anybody can act on. */
  | "with_them"
  /** Back with us. Done, and the source of the turnaround figure. */
  | "back"
  /** Logged but never sent. Somebody's intention, not the factory's problem. */
  | "not_sent";

export function rowPhase(open: FactoryRoundLike | null | undefined): FactoryPhase {
  if (!open) return "not_sent";
  if (clean(open.received_date)) return "back";
  return clean(open.submitted_date) ? "with_them" : "not_sent";
}

/** Whole days from a to b, or null when either end is missing or unreadable. */
export function daysApart(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = Date.parse(clean(a) + "T00:00:00Z");
  const y = Date.parse(clean(b) + "T00:00:00Z");
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round((y - x) / 86400000);
}

/** Every completed leg at this factory, in days sent → back. */
export function turnarounds(rounds: readonly FactoryRoundLike[]): number[] {
  const out: number[] = [];
  for (const r of rounds) {
    const d = daysApart(r.submitted_date, r.received_date);
    // A negative span is a typo, not a fast factory.
    if (d !== null && d >= 0) out.push(d);
  }
  return out;
}

function mean(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

export type FactoryStats = {
  /** Live styles — archived work is not this factory's workload. */
  styles: number;
  withThem: number;
  back: number;
  notSent: number;
  /** Open rounds out longer than this factory's own average. */
  overdue: number;
  /** Days, sent → back, averaged over completed rounds. null under two. */
  avgTurnaround: number | null;
  /** How many completed rounds that average is made of. */
  measured: number;
  good: number;
  workable: number;
  poor: number;
  unrated: number;
};

/**
 * One factory, summarised.
 *
 * Counted over live styles only. An archived style's round is not work, does
 * not appear in "with them now", and must not drag an average about how fast
 * they turn things around — it was very likely abandoned rather than slow.
 */
export function factoryStats<S extends FactoryStyleLike, R extends FactoryRoundLike>(
  group: FactoryGroup<S, R>,
  today: string
): FactoryStats {
  const stats: FactoryStats = {
    styles: group.styles.length,
    withThem: 0,
    back: 0,
    notSent: 0,
    overdue: 0,
    avgTurnaround: null,
    measured: 0,
    good: 0,
    workable: 0,
    poor: 0,
    unrated: 0,
  };

  const all: number[] = [];
  for (const row of group.styles) {
    all.push(...turnarounds(row.rounds));
    switch (rowPhase(row.open)) {
      case "with_them":
        stats.withThem += 1;
        break;
      case "back":
        stats.back += 1;
        break;
      default:
        stats.notSent += 1;
    }
  }

  // Quality counts EVERY style this factory has made, archived included (Tess,
  // 2026-08-07: "on the archived style in maxime's, it should list the red
  // style under rated with red dot even though it's archived").
  //
  // She is right, and it is a different question from the ones above. Whether
  // something is still being worked on is about the schedule; how it came out
  // is about the factory, and a sample that came back poor came back poor
  // whether or not the studio later dropped the style. Leaving archived work
  // out of the mix would quietly flatter every factory whose bad samples got
  // abandoned — which is most of them.
  //
  // The turnaround average deliberately does NOT do this: an archived round
  // that never came back was abandoned rather than slow, and counting it would
  // be a different kind of lie.
  for (const row of [...group.styles, ...group.archived]) {
    const r = row.rating;
    if (r === "good") stats.good += 1;
    else if (r === "workable") stats.workable += 1;
    else if (r === "poor") stats.poor += 1;
    else stats.unrated += 1;
  }

  stats.measured = all.length;
  // Two, not one. One completed round is a data point; calling the next one
  // late against it would be guessing with a red colour on.
  stats.avgTurnaround = all.length >= 2 ? mean(all) : null;

  if (stats.avgTurnaround !== null) {
    for (const row of group.styles) {
      if (rowPhase(row.open) !== "with_them") continue;
      const out = daysApart(row.open?.submitted_date, today);
      if (out !== null && out > stats.avgTurnaround) stats.overdue += 1;
    }
  }

  return stats;
}

export type FactoryRowView<S extends FactoryStyleLike, R extends FactoryRoundLike> =
  FactoryStyleRow<S, R> & {
    phase: FactoryPhase;
    /** Days since it went out. Only set while it is still with them. */
    daysOut: number | null;
    /** Days it took to come back. Only set once it is back. */
    turnaround: number | null;
    /** Out longer than this factory's own average, with an average to compare. */
    late: boolean;
    /** How many rounds of this style this factory has run. */
    roundsHere: number;
  };

/**
 * The rows, in the order a manager reads them.
 *
 * With them now first, longest-out at the top — that is the list you work down
 * on a call, and the one at the top is the one to ask about. Then what has come
 * back, most recent first, because that is the record you check an answer
 * against. Then anything logged but never sent, which is a studio to-do rather
 * than a factory one and belongs at the bottom of a factory's page.
 */
export function orderRows<S extends FactoryStyleLike, R extends FactoryRoundLike>(
  rows: readonly FactoryStyleRow<S, R>[],
  today: string,
  avgTurnaround: number | null
): FactoryRowView<S, R>[] {
  const views = rows.map((row) => {
    const phase = rowPhase(row.open);
    const daysOut = phase === "with_them" ? daysApart(row.open?.submitted_date, today) : null;
    const turnaround = phase === "back" ? daysApart(row.open?.submitted_date, row.open?.received_date) : null;
    return {
      ...row,
      phase,
      daysOut,
      turnaround,
      late: avgTurnaround !== null && daysOut !== null && daysOut > avgTurnaround,
      roundsHere: row.rounds.length,
    };
  });

  const rank: Record<FactoryPhase, number> = { with_them: 0, back: 1, not_sent: 2 };
  return views.sort((a, b) => {
    if (rank[a.phase] !== rank[b.phase]) return rank[a.phase] - rank[b.phase];
    if (a.phase === "with_them") return (b.daysOut ?? -1) - (a.daysOut ?? -1);
    if (a.phase === "back") {
      const ad = clean(a.open?.received_date);
      const bd = clean(b.open?.received_date);
      if (ad !== bd) return bd.localeCompare(ad);
    }
    return clean(a.style.name).localeCompare(clean(b.style.name), "en", { sensitivity: "base" });
  });
}
