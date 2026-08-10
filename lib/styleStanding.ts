/**
 * How this factory's version of a garment compares to the same garment at the
 * other factories developing it.
 *
 * Tess, 2026-08-06: "in the ai summary, give rational of how this compares to
 * the duplicate style with other factories -- best, same, worst, etc".
 *
 * The links at the top of a profile already say that Bella and Kavi are making
 * this too, and — since the round pill and the colour dot were added — roughly
 * where each of them is. What they do not do is ANSWER the question, and the
 * question is the only reason anybody clicks them: is the one I am looking at
 * the good one. Reading three pills and three dots and doing that comparison in
 * your head is work the page can do, and it is arithmetic, so the page should.
 *
 * WHAT "BEST" MEANS HERE, AND IN WHICH ORDER. Two facts are available about
 * each factory's development, and they answer different questions:
 *
 *   The RATING of its latest sample — good, workable, poor. This is quality:
 *   somebody picked the garment up and said what they thought of it. It is the
 *   thing "best" means in the sentence above, so it is decided first.
 *
 *   The ROUND it is on — 1st proto through bulk. This is progress, not
 *   quality, and on its own it is ambiguous in both directions: a factory on
 *   its 3rd proto may be ahead because it is moving, or behind because the
 *   first two were wrong. So it is used as the answer only when nobody has
 *   rated anything, and otherwise as the second sentence.
 *
 * WHAT IT REFUSES TO SAY, the same rule lib/styleSummary.ts follows: when there
 * is nothing to compare — no siblings, or nothing recorded on either side — it
 * returns null and the page prints nothing. A verdict computed from one rating
 * and three blanks would be a guess wearing a colour, and somebody would move
 * an order on it.
 *
 * UNRATED IS NOT BAD. A factory nobody has rated is left out of the quality
 * comparison entirely rather than scored zero, and is named in the sentence as
 * not yet rated. The absence of a judgement is not a poor judgement.
 *
 * Dependency-free — own structural types, no imports — so it can be unit tested
 * on its own like every other rule module in lib/. Labels and cycle order are
 * handed in by the caller, because those live in lib/types.ts.
 */

/** One factory's development of the garment, as this file needs it. */
export type StandingSide = {
  /** The factory's name, as written. Used in the sentence. */
  factory: string;
  /** Its latest round in the studio's words — "2nd Proto". "" if none logged. */
  roundLabel: string;
  /** That round's position in the cycle. -1 when there is no round. */
  rank: number;
  /** "good" | "workable" | "poor", or "" when nobody has rated it. */
  rating: string;
};

export type StyleStanding = {
  /**
   * best — nothing else rated higher, and something rated lower.
   * same — every rated factory, including this one, came out the same.
   * worst — nothing else rated lower, and something rated higher.
   * mixed — better than one and worse than another.
   * progress — nobody has rated anything; the verdict is about how far along.
   */
  verdict: "best" | "same" | "worst" | "mixed" | "progress";
  /** The one-line answer. */
  sentence: string;
  /** The second line: where it stands on the cycle. "" when there is nothing. */
  progress: string;
  /** Short phrase for the pill row beside the rest of the summary. */
  fact: string;
  /** True when this is the weakest of the set — worth the eye, like a late ETA. */
  attention: boolean;
};

const SCORE: Record<string, number> = { good: 3, workable: 2, poor: 1 };

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 3/2/1, or 0 for anything unrated or unrecognised. */
export function ratingScore(rating: string | null | undefined): number {
  return SCORE[text(rating).toLowerCase()] ?? 0;
}

/** "Bella", "Bella and Kavi", "Bella, Kavi and Toni". */
export function joinNames(names: readonly string[]): string {
  const ns = names.map(text).filter(Boolean);
  if (ns.length === 0) return "";
  if (ns.length === 1) return ns[0];
  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

/** "good at Bella", listed. Unrated sides are not passed in here. */
/** A rating word starting a sentence. "good here" reads as a typo; "Good" does. */
function cap(v: string): string {
  return v ? v[0].toUpperCase() + v.slice(1) : v;
}

function ratedPhrase(sides: readonly StandingSide[]): string {
  return joinNames(sides.map((s) => `${text(s.rating).toLowerCase()} at ${s.factory}`));
}

/**
 * The comparison, or null when there is nothing honest to say.
 *
 * `mine` is the profile being read; `others` are its siblings, already carrying
 * their latest round and that round's rating (lib/styleSiblings.ts fills both).
 */
export function compareStanding(
  mine: StandingSide,
  others: readonly StandingSide[]
): StyleStanding | null {
  const rest = (others ?? []).filter(Boolean);
  // No duplicates means no comparison. This is the common case and it prints
  // nothing at all rather than a line explaining that there is nothing to say.
  if (rest.length === 0) return null;

  const n = rest.length + 1;
  const mineScore = ratingScore(mine.rating);
  const ratedOthers = rest.filter((s) => ratingScore(s.rating) > 0);
  const unratedOthers = rest.filter((s) => ratingScore(s.rating) === 0);

  // --- Where it sits on the cycle -----------------------------------------
  // Computed first because it is the fallback verdict as well as the second
  // line, and both readings want the same three numbers.
  const ranked = rest.filter((s) => s.rank >= 0);
  let progress = "";
  let progressVerdict: "ahead" | "level" | "behind" | "" = "";

  if (mine.rank >= 0 && ranked.length > 0) {
    const ahead = ranked.filter((s) => s.rank < mine.rank);
    const behind = ranked.filter((s) => s.rank > mine.rank);
    const level = ranked.filter((s) => s.rank === mine.rank);
    if (behind.length === 0 && ahead.length > 0) {
      progressVerdict = "ahead";
      progress = `Furthest along too — ${joinNames(
        ahead.map((s) => `${s.factory} is on ${s.roundLabel || "no round yet"}`)
      )}.`;
    } else if (ahead.length === 0 && behind.length > 0) {
      progressVerdict = "behind";
      progress = `Behind on the cycle — ${joinNames(
        behind.map((s) => `${s.factory} is on ${s.roundLabel}`)
      )}.`;
    } else if (level.length === ranked.length) {
      progressVerdict = "level";
      progress = `Both on ${mine.roundLabel}.`;
      if (n > 2) progress = `All ${n} are on ${mine.roundLabel}.`;
    } else {
      progress = `On ${mine.roundLabel}; ${joinNames(
        ranked.map((s) => `${s.factory} on ${s.roundLabel}`)
      )}.`;
    }
  } else if (mine.rank < 0 && ranked.length > 0) {
    progressVerdict = "behind";
    progress = `No sample logged here yet — ${joinNames(
      ranked.map((s) => `${s.factory} is on ${s.roundLabel}`)
    )}.`;
  }

  // --- The verdict ---------------------------------------------------------
  // Quality decides it when there is quality on both sides to decide from.
  if (mineScore > 0 && ratedOthers.length > 0) {
    const scores = ratedOthers.map((s) => ratingScore(s.rating));
    const better = scores.filter((v) => v > mineScore).length;
    const worse = scores.filter((v) => v < mineScore).length;
    const mineWord = text(mine.rating).toLowerCase();
    const against = ratedPhrase(ratedOthers);
    const unrated = unratedOthers.length
      ? ` ${joinNames(unratedOthers.map((s) => s.factory))} ${
          unratedOthers.length === 1 ? "has" : "have"
        } not been rated.`
      : "";

    // Tess, 2026-08-07: "remove ... The best of the 2".
    //
    // The ranking preamble is gone from all four verdicts, not only the one she
    // was looking at — "The weakest of the 2" and "Middle of the 3" are the
    // same sentence with a different adjective, and leaving three of the four
    // would have made the wording depend on how a sample happened to score.
    //
    // What is left is the comparison itself, which is the part that can be
    // checked: this rated good, the other rated workable. The verdict is still
    // computed and still drives the chip and the attention flag — it just no
    // longer opens the sentence by announcing its own conclusion.
    let verdict: StyleStanding["verdict"];
    let lead: string;
    if (better === 0 && worse > 0) {
      verdict = "best";
      lead = `This sample rated ${mineWord}, against ${against}.`;
    } else if (worse === 0 && better > 0) {
      verdict = "worst";
      lead = `This sample rated ${mineWord}, against ${against}.`;
    } else if (better === 0 && worse === 0) {
      verdict = "same";
      lead = `${cap(mineWord)} here and ${against}.`;
    } else {
      verdict = "mixed";
      lead = `${cap(mineWord)} here, against ${against}.`;
    }

    return {
      verdict,
      sentence: lead + unrated,
      progress,
      fact:
        verdict === "best"
          ? `Best of ${n}`
          : verdict === "worst"
            ? `Weakest of ${n}`
            : verdict === "same"
              ? `Level with ${n - 1}`
              : `Middle of ${n}`,
      attention: verdict === "worst",
    };
  }

  // Nothing to compare on quality. Progress is the honest answer, and the
  // sentence says which of the two it is answering so nobody reads "furthest
  // along" as "best".
  if (!progress) return null;

  const noRatings =
    mineScore === 0 && ratedOthers.length === 0
      ? " Nothing has been rated on either side yet, so this is progress, not quality."
      : mineScore === 0
        ? ` This sample has not been rated; ${ratedPhrase(ratedOthers)}.`
        : ` Rated ${text(mine.rating).toLowerCase()} here, and nobody has rated the ${
            rest.length === 1 ? "other" : "others"
          }.`;

  return {
    verdict: "progress",
    sentence: progress + noRatings,
    progress: "",
    fact:
      progressVerdict === "ahead"
        ? `Furthest of ${n}`
        : progressVerdict === "behind"
          ? `Behind ${rest.length === 1 ? rest[0].factory : "the others"}`
          : progressVerdict === "level"
            ? "Level on the cycle"
            : `${n} factories`,
    attention: false,
  };
}
