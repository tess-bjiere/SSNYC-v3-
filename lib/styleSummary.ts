/**
 * Where a style stands, and how long its samples are taking.
 *
 * Tess, 2026-08-05: "Add an ai summary to the top that says the current status
 * of the product and approximate timing between samples."
 *
 * WHY THIS IS ARITHMETIC AND NOT A MODEL CALL. The two things asked for — the
 * current status, and the approximate timing between samples — are both already
 * written down. They are the round names, the requested dates and the received
 * dates on the cards further down the same page. A language model asked to read
 * those and say them back would be slower (a network round trip on every page
 * load), non-deterministic (two people opening the same profile could be told
 * different things), unverifiable (nobody can unit-test it), and would
 * occasionally invent a date. There is no version of that which is better than
 * subtraction.
 *
 * So this is subtraction, and the page says so rather than calling it AI. What
 * it gains by being arithmetic is that it is never wrong: every number here can
 * be checked against a card three inches below it, and the tests at the bottom
 * of this file check them too.
 *
 * WHAT IT REFUSES TO SAY. When there are not enough dates to support a claim it
 * says there are not enough dates, rather than averaging one number and calling
 * it a trend. A summary that quietly guesses is worse than no summary, because
 * a person plans a delivery around it.
 *
 * Dependency-free — no imports, its own structural types — so it can be tested
 * on its own. The caller supplies the round labels and the cycle order, because
 * those live in lib/types.ts and importing them would tie this to the app.
 */

/** One sample round, as this file needs it. */
export type SummaryRound = {
  /** The round in the studio's own words — "2nd Proto", "PPS". */
  label: string;
  /** Its position in the sample cycle. Lower is earlier. */
  order: number;
  /** The studio's status for the round, already in its own words. */
  status?: string | null;
  /** When it was asked for. YYYY-MM-DD. */
  requested?: string | null;
  /** When it arrived. YYYY-MM-DD. */
  received?: string | null;
  /** When it is expected, if it has not arrived. YYYY-MM-DD. */
  eta?: string | null;
};

export type StyleSummaryInput = {
  /** inspo | development | production | archived. */
  styleStatus?: string | null;
  evergreen?: boolean;
  rounds: readonly SummaryRound[];
  /** Today, YYYY-MM-DD, in the studio's timezone. Passed in so this is pure. */
  today: string;
};

export type StyleSummary = {
  /** One sentence: where the garment is right now. */
  headline: string;
  /** One sentence: how long things have been taking. */
  timing: string;
  /** Short supporting phrases — the numbers behind the two sentences. */
  facts: string[];
  /** True when something is late or unanswered and worth the eye. */
  attention: boolean;
};

/** Days between two YYYY-MM-DD dates, or null if either is unreadable. */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = utc(from);
  const b = utc(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

function utc(d: string | null | undefined): number | null {
  const s = (d ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** "1 day" / "12 days". Zero reads as "today" at the call site, not here. */
function days(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/** The round the page is about: the furthest along the cycle. */
export function latestRound(rounds: readonly SummaryRound[]): SummaryRound | null {
  let best: SummaryRound | null = null;
  for (const r of rounds) {
    if (!r) continue;
    if (!best || r.order > best.order) best = r;
  }
  return best;
}

/**
 * How long rounds have been taking to come back — requested to received, one
 * number per round that has both dates.
 */
export function turnarounds(rounds: readonly SummaryRound[]): number[] {
  const out: number[] = [];
  for (const r of rounds) {
    const d = daysBetween(r?.requested, r?.received);
    // A negative turnaround is a typo in a date, not a fast factory. Dropped
    // rather than averaged in, because one of them poisons the mean.
    if (d !== null && d >= 0) out.push(d);
  }
  return out;
}

/**
 * The gap between one round arriving and the next going out — how long the
 * studio takes to look at a sample and ask for the next one. This is the half
 * of the cycle the studio actually controls.
 */
export function gapsBetweenRounds(rounds: readonly SummaryRound[]): number[] {
  const seq = [...rounds].filter(Boolean).sort((a, b) => a.order - b.order);
  const out: number[] = [];
  for (let i = 1; i < seq.length; i++) {
    const d = daysBetween(seq[i - 1].received, seq[i].requested);
    if (d !== null && d >= 0) out.push(d);
  }
  return out;
}

function mean(ns: readonly number[]): number {
  return Math.round(ns.reduce((a, b) => a + b, 0) / ns.length);
}

/**
 * The whole summary.
 *
 * Read it as two sentences and a handful of numbers: what is happening, how
 * long it has been taking, and the arithmetic behind both.
 */
export function summarizeStyle(input: StyleSummaryInput): StyleSummary {
  const rounds = (input.rounds ?? []).filter(Boolean);
  const today = input.today;
  const status = text(input.styleStatus).toLowerCase();
  const facts: string[] = [];
  let attention = false;

  const latest = latestRound(rounds);

  // --- Where it stands -----------------------------------------------------
  let headline: string;

  if (!latest) {
    headline =
      status === "inspo"
        ? "Not in development yet — nothing has been sampled."
        : status === "archived"
          ? "Archived, with no sample rounds on record."
          : "In development, but no sample round has been raised yet.";
  } else if (latest.received) {
    const ago = daysBetween(latest.received, today);
    const when = ago === null ? "" : ago <= 0 ? " today" : ` ${days(ago)} ago`;
    const st = text(latest.status);
    headline = `${latest.label} came back${when}${st ? ` — ${st}` : ""}.`;
    // A sample that arrived a long time ago and has not moved is the quiet
    // failure this summary exists to catch: nobody is waiting on a factory, so
    // nobody is chasing, and the style has simply stopped.
    if (ago !== null && ago >= 21 && st.toLowerCase() !== "not moving forward") {
      attention = true;
      facts.push(`No movement in ${days(ago)}`);
    }
  } else if (latest.requested) {
    const out = daysBetween(latest.requested, today);
    headline =
      out === null
        ? `Waiting on ${latest.label}.`
        : out <= 0
          ? `Waiting on ${latest.label} — requested today.`
          : `Waiting on ${latest.label} — out for ${days(out)}.`;
    const late = daysBetween(latest.eta, today);
    if (late !== null && late > 0) {
      attention = true;
      facts.push(`${days(late)} past its ETA`);
    } else if (late !== null) {
      facts.push(late === 0 ? "Due today" : `Due in ${days(-late)}`);
    } else {
      attention = true;
      facts.push("No ETA recorded");
    }
  } else {
    headline = `${latest.label} is open, with no dates on it yet.`;
    attention = true;
    facts.push("No dates on the current round");
  }

  // --- How long it has been taking ----------------------------------------
  const backs = turnarounds(rounds);
  const gaps = gapsBetweenRounds(rounds);
  let timing: string;

  if (backs.length === 0) {
    timing =
      rounds.length === 0
        ? "No sample history yet, so there is nothing to time."
        : "Not enough dates yet to say how long samples are taking.";
  } else if (backs.length === 1) {
    timing = `One round measured so far: it took ${days(backs[0])} to come back.`;
  } else {
    timing = `Samples have been taking about ${days(mean(backs))} to come back, across ${backs.length} rounds.`;
  }

  if (gaps.length >= 1) {
    const g = mean(gaps);
    timing +=
      gaps.length === 1
        ? ` The next round went out ${days(g)} after the last one arrived.`
        : ` About ${days(g)} passes between one arriving and the next going out.`;
  }

  // "≈ 22 days a round, end to end" used to be a fact here and it is gone
  // (Tess, 2026-08-07: "remove ≈ 22 days a round, end to end"). It was an
  // average of an average — the mean turnaround plus the mean gap — and the
  // paragraph directly above it already gives both halves separately, in the
  // units somebody can act on. Adding them together produced a single number
  // that looked more precise than either input and could not be checked against
  // anything on the page.

  // "2 of 2 rounds back" used to sit here and it is gone (Tess, 2026-08-06:
  // "remove 2 of 2 rounds back from ai"). It was the one fact in this box that
  // said nothing: the headline directly above it already names the round in
  // hand and whether it has come back, and the rounds themselves are listed in
  // full further down the same page. A count of a list you can see is not a
  // finding, and on a style with one round it read "1 of 1 rounds back", which
  // is a sentence nobody needs written for them.

  return { headline, timing, facts, attention };
}
