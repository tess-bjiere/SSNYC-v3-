/**
 * How the development grid is ordered, and what a thumbnail says.
 *
 * The grid used to be ordered by updated_at and nothing else, which answers
 * exactly one question — "what did somebody touch?" — and it is not the
 * question anybody actually walks up to the screen with. The four orders here
 * are the four questions that get asked out loud:
 *
 *   recent      what moved?
 *   attention   what is stuck, late, or waiting on us?
 *   final       what is nearly done?
 *   fitting     what is on the rail waiting to be tried on?
 *
 * Each style is reduced to one DevSummary first, and every sort then reads the
 * summary rather than re-deriving anything. That is what stops "needs
 * attention" and the amber dot on the card from ever disagreeing — there is one
 * definition of late and both of them read it.
 *
 * Dependency-free on purpose: unit-tested directly by node's test runner, and
 * so it deliberately re-implements the two or three date helpers it needs
 * rather than importing lib/sampleCycle.ts. The canonical round order and the
 * round labels are passed in for the same reason.
 */

export type DevSampleLike = {
  style_id?: string | null;
  round?: string | null;
  status?: string | null;
  submitted_date?: string | null;
  received_date?: string | null;
  eta_date?: string | null;
  fit_notes?: string | null;
  /** "good" | "workable" | "poor", or null/absent for a round nobody rated. */
  rating?: string | null;
  created_at?: string | null;
};

export type DevStyleLike = {
  id: string;
  name?: string | null;
  status?: string | null;
  evergreen?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

// ---------------------------------------------------------------------------
// Local date helpers — see the header for why these are not imported.
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayNumber(d: string | null | undefined): number | null {
  if (typeof d !== "string") return null;
  const m = DATE_RE.exec(d.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const ms = Date.UTC(y, mo - 1, da);
  const back = new Date(ms);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return null;
  return Math.round(ms / 86400000);
}

function shortDate(d: string | null | undefined): string {
  if (typeof d !== "string") return "";
  const m = DATE_RE.exec(d.trim());
  if (!m || dayNumber(d) === null) return d.trim();
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}`;
}

/** The calendar day part of a timestamp, so updated_at can be compared to a date. */
function dayOfStamp(stamp: string | null | undefined): number | null {
  if (typeof stamp !== "string") return null;
  return dayNumber(stamp.slice(0, 10));
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Case-insensitive A→Z, empty last. The comparator for the "A–Z" order. */
function cmpTextAsc(a: string | null | undefined, b: string | null | undefined): number {
  const x = text(a).toLowerCase();
  const y = text(b).toLowerCase();
  if (x === y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return x < y ? -1 : 1;
}

/** Later stamp first, empty last. The comparator for the "Newly added" order. */
function cmpStampDesc(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

// ---------------------------------------------------------------------------
// The sorts
// ---------------------------------------------------------------------------

export type DevSort = {
  id: string;
  label: string;
  /** What this order actually means, shown under the control. */
  hint: string;
};

export const DEV_SORTS: readonly DevSort[] = [
  {
    id: "recent",
    label: "Recent updates",
    hint: "Last touched first.",
  },
  {
    id: "attention",
    label: "Needs attention",
    hint: "Overdue samples, then arrived-but-unfitted, then nothing logged.",
  },
  {
    id: "final",
    label: "Closest to final",
    hint: "Furthest through the sample rounds first.",
  },
  {
    id: "fitting",
    label: "Ready for fitting",
    hint: "Samples that have landed and have no fit notes yet.",
  },
  // Two plain orders (Tess, 2026-08-09: "sort options wrong/short"). The four
  // above answer a question about where a style is in the cycle; these two
  // answer "where is it in a list" — the order you want when you already know
  // the name, or when you are looking at what just got created. They read the
  // style row directly and need no summary, so a style with no rounds logged
  // still sorts correctly under them.
  {
    id: "az",
    label: "A–Z",
    hint: "By name, A to Z.",
  },
  {
    id: "newest",
    label: "Newly added",
    hint: "Most recently created first.",
  },
] as const;

export const DEV_SORT_IDS: readonly string[] = DEV_SORTS.map((s) => s.id);
export const DEFAULT_DEV_SORT = "recent";

/** A sort id from a URL query, or the default. Never throws on rubbish. */
export function devSortId(raw: string | null | undefined): string {
  const want = text(raw);
  return DEV_SORT_IDS.includes(want) ? want : DEFAULT_DEV_SORT;
}

export function devSortLabel(id: string): string {
  return DEV_SORTS.find((s) => s.id === id)?.label ?? DEV_SORTS[0].label;
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

export type DevEtaState = "none" | "due" | "late" | "landed";

/**
 * The three verdicts a round can carry. Restated here rather than imported,
 * because every rule module in lib/ is dependency-free so it can be unit
 * tested on its own. If lib/types.ts ever grows a fourth, a test in
 * devSort.test.mts is where the mismatch shows up.
 */
const RATINGS = ["good", "workable", "poor"];

export type DevSummary = {
  styleId: string;
  /** The furthest-along round this style has, or "" if none is logged. */
  roundKey: string;
  /** "2nd Proto" — from the labels map, falling back to the raw key. */
  roundLabel: string;
  etaState: DevEtaState;
  /** "ETA 12 Mar 27" / "3 days overdue" / "In 4 Mar 27" / "". */
  etaLabel: string;
  /** Days overdue when late, days remaining when due, else null. */
  etaDays: number | null;
  /**
   * How far through the cycle, 0 to 1. Rank of the current round over the
   * length of the standard list, plus a half-step once the round is back.
   */
  progress: number;
  /** The sample has arrived and nobody has written a fit note on it. */
  readyForFitting: boolean;
  /** Higher is more urgent. 0 means nothing is asking for anything. */
  attention: number;
  /** Why it wants attention, in a few words. "" when attention is 0. */
  attentionLabel: string;
  /**
   * How the round this style is on came out — "good" | "workable" | "poor", or
   * "" for a round nobody has rated (Tess, 2026-08-06: "have rating (green,
   * yellow, red) of most recent sample on thumbnail").
   *
   * Deliberately the raw word, not a colour: this module decides facts and the
   * card decides how they look. It is also deliberately the rating of the round
   * the style is ON, by the same currentSample rule the round label uses, so
   * the dot and the words beside it are describing the same sample. A dot taken
   * off the newest ROW would sometimes be rating a 1st proto typed in late,
   * while the label beside it said 2nd Proto.
   *
   * Unrecognised words come back as "" rather than riding through, because this
   * feeds a class name and a colour is not a place to put arbitrary text.
   */
  rating: string;
  /** Sort key for "recent" — updated_at, falling back to created_at. */
  touchedAt: string;
};

/**
 * Rank of a round in the canonical order. Anything not in the list ranks last
 * rather than first, so a one-off round somebody typed by hand never reads as
 * "nearly finished". Same rule as lib/sampleCycle.ts, restated here.
 */
function rankOf(round: string | null | undefined, order: readonly string[]): number {
  const i = order.indexOf(text(round));
  return i === -1 ? -1 : i;
}

/**
 * The round a style is "on": the furthest through the standard order that has
 * been logged. Not the most recently created row — somebody adding a missed
 * 1st proto after the 2nd has been submitted should not move the style
 * backwards. Rows with an unrecognised round are used only when there is
 * nothing else, and then the newest wins.
 */
function currentSample<T extends DevSampleLike>(rows: readonly T[], order: readonly string[]): T | null {
  let best: T | null = null;
  let bestRank = -2;
  let bestStamp = "";

  for (const row of rows) {
    const rank = rankOf(row.round, order);
    const stamp = text(row.created_at);
    if (rank > bestRank || (rank === bestRank && stamp > bestStamp)) {
      best = row;
      bestRank = rank;
      bestStamp = stamp;
    }
  }
  return best;
}

/**
 * Reduce one style and its rounds to the handful of facts the grid needs.
 *
 * `today` is passed in rather than read from the clock so this stays pure and
 * the tests do not drift — callers hand it a "YYYY-MM-DD" in studio time.
 */
export function summarize<S extends DevStyleLike, T extends DevSampleLike>(
  style: S,
  samples: readonly T[],
  order: readonly string[],
  labels: Record<string, string>,
  today: string
): DevSummary {
  const sample = currentSample(samples, order);
  const roundKey = text(sample?.round);
  const rank = rankOf(roundKey, order);

  const received = dayNumber(sample?.received_date);
  const submitted = dayNumber(sample?.submitted_date);
  const eta = dayNumber(sample?.eta_date);
  const now = dayNumber(today);

  // --- ETA ---------------------------------------------------------------
  let etaState: DevEtaState = "none";
  let etaLabel = "";
  let etaDays: number | null = null;

  if (received !== null) {
    etaState = "landed";
    etaLabel = `In ${shortDate(sample?.received_date)}`;
  } else if (eta !== null) {
    if (now !== null && now - eta > 0) {
      etaState = "late";
      etaDays = now - eta;
      etaLabel = `${etaDays} day${etaDays === 1 ? "" : "s"} overdue`;
    } else {
      etaState = "due";
      etaDays = now === null ? null : Math.abs(now - eta);
      etaLabel = `ETA ${shortDate(sample?.eta_date)}`;
    }
  }

  // --- Progress ----------------------------------------------------------
  // Rank over the list length puts proto1 near the bottom and bulk at the top.
  // The half-step for a received round is what separates "submitted the PPS"
  // from "the PPS is back", which is a real difference in how close to final
  // something is and the only difference between those two states.
  let progress = 0;
  if (rank >= 0 && order.length > 0) {
    const step = 1 / order.length;
    progress = rank * step + (received !== null ? step : step / 2);
    if (progress > 1) progress = 1;
  }

  // --- Fitting -----------------------------------------------------------
  // It is here and nobody has said how it fits. That is the whole definition,
  // and it is deliberately not a status somebody has to remember to set — the
  // rail fills up on its own and empties when the note gets written.
  const readyForFitting = received !== null && !text(sample?.fit_notes);

  // --- Attention ---------------------------------------------------------
  // A single number so the sort and the card can never disagree. The bands are
  // an order of magnitude apart so a category always beats the one below it
  // regardless of how many days are involved.
  let attention = 0;
  let attentionLabel = "";

  if (etaState === "late") {
    // 1000+ : late, and later is worse. Capped so a sample forgotten for two
    // years does not permanently own the top of the list.
    attention = 1000 + Math.min(etaDays ?? 0, 365);
    attentionLabel = etaLabel;
  } else if (readyForFitting) {
    attention = 500;
    attentionLabel = "Waiting to be fitted";
  } else if (submitted !== null && received === null && eta === null) {
    // At the factory with no promised date. Nobody can plan around this.
    attention = 300;
    attentionLabel = "At factory, no ETA";
  } else if (!sample && text(style.status) === "development") {
    attention = 200;
    attentionLabel = "No rounds logged";
  } else {
    // Stale: in development, something is logged, and nothing has moved in a
    // month. Low priority by design — it is a nudge, not an alarm.
    const touched = dayOfStamp(style.updated_at) ?? dayOfStamp(style.created_at);
    if (text(style.status) === "development" && touched !== null && now !== null && now - touched >= 30) {
      attention = 100;
      attentionLabel = `Quiet ${now - touched} days`;
    }
  }

  return {
    styleId: text(style.id),
    roundKey,
    roundLabel: roundKey ? labels[roundKey] ?? roundKey : "",
    etaState,
    etaLabel,
    etaDays,
    progress,
    readyForFitting,
    attention,
    attentionLabel,
    rating: RATINGS.includes(text(sample?.rating)) ? text(sample?.rating) : "",
    touchedAt: text(style.updated_at) || text(style.created_at),
  };
}

/** Group a flat sample list by style_id. */
export function groupSamples<T extends DevSampleLike>(rows: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const id = text(row.style_id);
    if (!id) continue;
    const list = out.get(id);
    if (list) list.push(row);
    else out.set(id, [row]);
  }
  return out;
}

/** Summaries for a whole grid, keyed by style id. */
export function summarizeAll<S extends DevStyleLike, T extends DevSampleLike>(
  styles: readonly S[],
  samples: readonly T[],
  order: readonly string[],
  labels: Record<string, string>,
  today: string
): Map<string, DevSummary> {
  const grouped = groupSamples(samples);
  const out = new Map<string, DevSummary>();
  for (const style of styles) {
    const id = text(style.id);
    out.set(id, summarize(style, grouped.get(id) ?? [], order, labels, today));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The ordering itself
// ---------------------------------------------------------------------------

/**
 * Order a list of styles by one of the four sorts.
 *
 * Every sort falls back to touchedAt and then to the incoming position, so the
 * order is total and stable: the grid never reshuffles itself between two
 * renders of the same data. Styles with no summary sort last rather than
 * throwing.
 *
 * Nothing is filtered out. "Needs attention" puts the calm styles at the
 * bottom; it does not hide them, because a grid that silently drops rows is
 * how work goes missing.
 */
export function sortStyles<S extends DevStyleLike>(
  styles: readonly S[],
  summaries: Map<string, DevSummary>,
  sortId: string
): S[] {
  const id = devSortId(sortId);

  const scored = styles.map((style, i) => ({
    style,
    i,
    s: summaries.get(text(style.id)) ?? null,
  }));

  scored.sort((a, b) => {
    // The two plain orders read the row, not the summary, so they order every
    // style the same whether or not it has rounds. Empty names and undated rows
    // sort last rather than jumping to the top.
    if (id === "az") {
      const d = cmpTextAsc(a.style.name, b.style.name);
      return d !== 0 ? d : a.i - b.i;
    }
    if (id === "newest") {
      const d = cmpStampDesc(text(a.style.created_at), text(b.style.created_at));
      return d !== 0 ? d : a.i - b.i;
    }

    if (a.s && !b.s) return -1;
    if (!a.s && b.s) return 1;

    if (a.s && b.s) {
      let d = 0;
      if (id === "attention") d = b.s.attention - a.s.attention;
      else if (id === "final") d = b.s.progress - a.s.progress;
      else if (id === "fitting") {
        d = Number(b.s.readyForFitting) - Number(a.s.readyForFitting);
        // Within the rail, the one that has been sitting longest goes first.
        if (d === 0 && a.s.readyForFitting && b.s.readyForFitting) {
          d = a.s.touchedAt < b.s.touchedAt ? -1 : a.s.touchedAt > b.s.touchedAt ? 1 : 0;
          if (d !== 0) return d;
        }
      }
      if (d !== 0) return d;

      // Newest first — the tiebreak for every sort, and the whole of "recent".
      const ta = a.s.touchedAt;
      const tb = b.s.touchedAt;
      if (ta !== tb) {
        if (!ta) return 1;
        if (!tb) return -1;
        return ta < tb ? 1 : -1;
      }
    }

    return a.i - b.i; // stable
  });

  return scored.map((x) => x.style);
}

/** "2nd Proto · 3 days overdue" — the one line a thumbnail has room for. */
export function thumbLine(s: DevSummary | null | undefined): string {
  if (!s) return "";
  return [s.roundLabel, s.etaLabel].filter(Boolean).join(" · ");
}
