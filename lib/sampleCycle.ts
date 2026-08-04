// Sample-round arithmetic (P3 #40).
//
// A round has two legs, and the studio kept losing time on the first one:
//
//   raw material   ordered -> eta -> received     (supplier -> factory)
//   factory        submitted -> received          (factory -> us)
//
// Only the factory leg was ever recorded, so a round that was late because the
// fabric was late looked exactly like a round that was late because the factory
// was slow. These helpers turn the four material dates into the small number of
// facts the profile and the by-factory view actually display.
//
// Dependency-free on purpose: unit-tested directly by node's test runner.
//
// Dates are stored as Postgres `date` and arrive as "YYYY-MM-DD" with no zone.
// They are treated as plain calendar days throughout — never converted to a
// timestamp — so a round submitted on the 3rd reads as the 3rd in every
// timezone the team works in.

export type SampleLike = {
  round?: string | null;
  factory?: string | null;
  status?: string | null;
  comments?: string | null;
  fit_notes?: string | null;
  submitted_date?: string | null;
  received_date?: string | null;
  material_supplier?: string | null;
  material_ordered_date?: string | null;
  material_eta_date?: string | null;
  material_received_date?: string | null;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970 for a "YYYY-MM-DD" string, or null if it isn't one. */
export function dayNumber(d: string | null | undefined): number | null {
  if (typeof d !== "string") return null;
  const m = DATE_RE.exec(d.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const ms = Date.UTC(y, mo - 1, da);
  const back = new Date(ms);
  // Rejects the 31st of a 30-day month and 29 Feb in a common year, both of
  // which Date.UTC would silently roll forward into the next month.
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return null;
  return Math.round(ms / 86400000);
}

/** Whole days from a to b, or null if either isn't a date. Can be negative. */
export function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = dayNumber(a);
  const y = dayNumber(b);
  if (x === null || y === null) return null;
  return y - x;
}

/** "2027-03-12" -> "12 Mar 27". Anything else passes through untouched. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(d: string | null | undefined): string {
  if (typeof d !== "string") return "";
  const m = DATE_RE.exec(d.trim());
  if (!m || dayNumber(d) === null) return typeof d === "string" ? d.trim() : "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}`;
}

export type MaterialState =
  | "none" // nothing recorded — the material leg isn't being tracked for this round
  | "ordered" // ordered, no ETA yet
  | "due" // ETA in the future
  | "late" // ETA passed and it still hasn't landed
  | "received"; // in at the factory

export type MaterialStatus = {
  state: MaterialState;
  /** Days late (positive) when state is "late", days until arrival when "due". */
  days: number | null;
  label: string;
};

/**
 * Where the raw material for this round has got to.
 *
 * `today` is passed in rather than read from the clock so this stays a pure
 * function and the tests don't drift — callers pass a "YYYY-MM-DD".
 */
export function materialStatus(s: SampleLike, today: string): MaterialStatus {
  const received = dayNumber(s.material_received_date);
  const eta = dayNumber(s.material_eta_date);
  const ordered = dayNumber(s.material_ordered_date);
  const now = dayNumber(today);

  if (received !== null) {
    return { state: "received", days: null, label: `Material in ${shortDate(s.material_received_date)}` };
  }
  if (eta !== null && now !== null) {
    const delta = now - eta;
    if (delta > 0) {
      return {
        state: "late",
        days: delta,
        label: `Material ${delta} day${delta === 1 ? "" : "s"} late`,
      };
    }
    return {
      state: "due",
      // Math.abs, not -delta: on the ETA day itself delta is 0 and negating it
      // would hand callers -0, which formats as "-0 days".
      days: Math.abs(delta),
      label: `Material due ${shortDate(s.material_eta_date)}`,
    };
  }
  if (eta !== null) {
    return { state: "due", days: null, label: `Material due ${shortDate(s.material_eta_date)}` };
  }
  if (ordered !== null) {
    return { state: "ordered", days: null, label: `Material ordered ${shortDate(s.material_ordered_date)}` };
  }
  return { state: "none", days: null, label: "" };
}

/** How long the material leg took, once it's done. */
export function materialLeadDays(s: SampleLike): number | null {
  return daysBetween(s.material_ordered_date, s.material_received_date);
}

/** How long the factory held the round, once it's back. */
export function factoryLeadDays(s: SampleLike): number | null {
  return daysBetween(s.submitted_date, s.received_date);
}

/**
 * Where a round sits in the cycle. The canonical order is passed in rather than
 * imported so this file stays dependency-free — callers hand it SAMPLE_ROUNDS.
 * Anything not in the standard list sorts last rather than first, so a one-off
 * round someone typed by hand never jumps the queue.
 */
export function roundRank(round: string | null | undefined, order: readonly string[]): number {
  const i = order.indexOf(typeof round === "string" ? round.trim() : "");
  return i === -1 ? order.length : i;
}

/**
 * Rounds in cycle order — proto1 before proto2 before SMS — falling back to
 * created_at when two rows share a rank.
 *
 * Insertion order is not good enough: three rounds logged in one sitting share a
 * timestamp, and the row order Postgres hands back for a tie can change the
 * moment one of them is edited. A season that reorders itself when you save a
 * date is worse than useless.
 */
export function sortSamples<T extends SampleLike & { created_at?: string | null }>(
  rows: readonly T[],
  order: readonly string[]
): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const ra = roundRank(a.row.round, order);
      const rb = roundRank(b.row.round, order);
      if (ra !== rb) return ra - rb;
      const ca = a.row.created_at ?? "";
      const cb = b.row.created_at ?? "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.i - b.i; // stable
    })
    .map((x) => x.row);
}

export type SampleState = "planned" | "material" | "at_factory" | "received";

/**
 * The single word for where a round is. Read strictly back-to-front: the last
 * thing that has actually happened wins, so a half-filled row never reads as
 * further along than it is.
 */
export function sampleState(s: SampleLike): SampleState {
  if (dayNumber(s.received_date) !== null) return "received";
  if (dayNumber(s.submitted_date) !== null) return "at_factory";
  if (
    dayNumber(s.material_ordered_date) !== null ||
    dayNumber(s.material_eta_date) !== null ||
    dayNumber(s.material_received_date) !== null
  ) {
    return "material";
  }
  return "planned";
}

export const SAMPLE_STATE_LABELS: Record<SampleState, string> = {
  planned: "Planned",
  material: "In material",
  at_factory: "At factory",
  received: "Received",
};

/**
 * The dated timeline for one round, in order, skipping anything not recorded.
 * The profile renders this straight out; nothing else decides the order.
 */
export type TimelineStep = { key: string; label: string; date: string };
export function sampleTimeline(s: SampleLike): TimelineStep[] {
  const steps: [string, string, string | null | undefined][] = [
    ["ordered", "Material ordered", s.material_ordered_date],
    ["eta", "Material due", s.material_eta_date],
    ["material_in", "Material in", s.material_received_date],
    ["submitted", "Submitted", s.submitted_date],
    ["received", "Received", s.received_date],
  ];
  const out: TimelineStep[] = [];
  for (const [key, label, date] of steps) {
    if (dayNumber(date) === null) continue;
    out.push({ key, label, date: shortDate(date) });
  }
  return out;
}
