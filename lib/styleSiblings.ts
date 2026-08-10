/**
 * The same style, made at more than one factory.
 *
 * Tess, 2026-08-05: "if a style is developed by multiple factories, they should
 * have their own profile for each but provide hyperlinks to the other duplicate
 * styles."
 *
 * The instruction contains the design. There is an obvious-looking alternative
 * — one profile with a list of factories on it — and it is wrong for the reason
 * the studio already knows: two factories making the same garment are two
 * different developments. They have their own protos, their own fit notes,
 * their own ETAs, their own photographs of their own samples, and their own
 * answer to "is this ready". Squashing them into one profile means every round
 * on the page needs a factory label and every question needs asking twice, and
 * the first time somebody reads the wrong row the tool has lied to them.
 *
 * So: separate profiles, which the app already supports because a style already
 * has one factory. What is missing is that neither profile knows the other one
 * exists. This file is that knowledge, and nothing else.
 *
 * WHAT COUNTS AS THE SAME STYLE. Two rules, in order of confidence:
 *
 *   1. The same style number. A style number is the studio's own identifier for
 *      a garment, so two rows carrying "SS-100" are the same garment by the
 *      studio's own account. This is the strong signal.
 *   2. Failing that, the same name AND the same season. A name on its own is not
 *      enough — "Anorak Jacket" recurs every year and last year's is a different
 *      development, not a duplicate — but a name repeated within one season is.
 *
 * And in both cases the factories must DIFFER. Two rows at the same factory with
 * the same number are a mistake or a re-entry; calling them duplicates of each
 * other would put a link on a profile pointing at what looks like itself.
 *
 * NOTHING IS MERGED, NOTHING IS DELETED, NOTHING IS CREATED. This file reads a
 * list and reports relationships. It has no opinion about which profile is the
 * original.
 *
 * Dependency-free, so it can be tested on its own and takes plain shapes.
 */

/** The parts of a style this file reads. */
export type SiblingStyleLike = {
  id: string;
  name?: string | null;
  style_no?: string | null;
  season?: string | null;
  factory?: string | null;
  status?: string | null;
  deleted_at?: string | null;
};

/** Another profile of the same garment, as it reads on a link. */
export type StyleSibling = {
  id: string;
  /** The factory that distinguishes it — the whole reason the link exists. */
  factory: string;
  season: string;
  name: string;
  status: string;
  /** Which rule matched: the studio's own number, or name-within-a-season. */
  matchedOn: "style_no" | "name+season";
  /**
   * The round that development is on — the raw key, e.g. "proto2", or "" when
   * that factory has not logged a sample yet.
   *
   * Tess, 2026-08-05: "for the also in development with -- put the sample round
   * (eg 2nd proto) instead of development next to name". The style status was
   * the wrong fact to carry here: both profiles of a garment being developed
   * say "development", so the pill was printing the same word on every link and
   * answering nothing. The round is the answer to the question the link is
   * actually asked — how far on is the other one.
   *
   * Filled by withLatestRounds, not by siblingsOf, because it needs a second
   * read of the samples table and a link is worth drawing without it.
   */
  round: string;
  /**
   * How that round was rated — "good" | "workable" | "poor", or "" when nobody
   * has rated it yet.
   *
   * Tess, 2026-08-06: "this should have color dot on what the last round
   * received was". The round name says how far along the other factory is; it
   * says nothing about whether what came back was any good, and those are two
   * different questions with two different answers. A factory on its 3rd proto
   * because the first two were poor is not in the same position as a factory on
   * its 3rd proto because the studio keeps adding colourways, and the link
   * currently reads identically in both cases.
   *
   * Unrated stays "" and draws no dot. There is no grey dot for "nobody has
   * looked", because a mark on the page is read as a judgement and the absence
   * of one is the honest report.
   */
  rating: string;
};

/** The parts of a sample round this file reads. */
export type SiblingSampleLike = {
  style_id?: string | null;
  round?: string | null;
  created_at?: string | null;
  rating?: string | null;
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function fold(v: unknown): string {
  return text(v).toLowerCase();
}

/** The identifying key of a style, or "" when it has nothing to be identified by. */
export function siblingKey(s: SiblingStyleLike): string {
  const no = fold(s.style_no);
  if (no) return "no:" + no;
  const name = fold(s.name);
  const season = fold(s.season);
  if (name && season) return "ns:" + name + "|" + season;
  return "";
}

/** The factory a style is made at, folded. "" means nobody has said. */
function factoryOf(s: SiblingStyleLike): string {
  return fold(s.factory);
}

/**
 * The other profiles of the same garment, at other factories.
 *
 * A style with no number and no season has no siblings by construction — there
 * is nothing to match it on that would not also match half the library.
 *
 * A style whose factory is blank returns nothing either, and that is deliberate
 * rather than an oversight: "made somewhere unrecorded" is not a second factory,
 * and offering a link labelled with no factory would be a link that does not say
 * where it goes. Fill the factory in and the link appears.
 *
 * Deleted rows are skipped — this app does not remove things, it stops reading
 * them, and a link into something the studio has stopped reading is a trap.
 */
export function siblingsOf(
  style: SiblingStyleLike,
  all: readonly SiblingStyleLike[]
): StyleSibling[] {
  const key = siblingKey(style);
  if (!key) return [];
  const mine = factoryOf(style);
  if (!mine) return [];

  const out: StyleSibling[] = [];
  const seen = new Set<string>();

  for (const other of all) {
    if (!other || other.id === style.id) continue;
    if (text(other.deleted_at)) continue;
    if (siblingKey(other) !== key) continue;
    const theirs = factoryOf(other);
    // Same factory is not a duplicate development, and no factory is not a
    // factory. Either way there is nothing to say on a link.
    if (!theirs || theirs === mine) continue;
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    out.push({
      id: other.id,
      factory: text(other.factory),
      season: text(other.season),
      name: text(other.name),
      status: text(other.status),
      round: "",
      rating: "",
      matchedOn: key.startsWith("no:") ? "style_no" : "name+season",
    });
  }

  // Alphabetical by factory: the factory is what the reader is choosing between,
  // and a list that reorders itself between page loads is unusable as a menu.
  out.sort((a, b) => a.factory.localeCompare(b.factory) || a.id.localeCompare(b.id));
  return out;
}

/**
 * "Also in development with Bella" / "… Bella and Toni" / "… Bella, Toni and
 * Kavi". Tess, 2026-08-05: "also made at should be 'also in development
 * with'" — "made at" claims the garment is in production somewhere, and none
 * of these are; they are two factories sampling the same style.
 */
export function siblingLabel(siblings: readonly StyleSibling[]): string {
  const names = siblings.map((s) => s.factory).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return `Also in development with ${names[0]}`;
  if (names.length === 2) return `Also in development with ${names[0]} and ${names[1]}`;
  return `Also in development with ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The round each sibling is on, written onto the links.
 *
 * "Latest" is the furthest through the cycle, not the most recently typed —
 * exactly the rule lib/sampleCycle.ts uses for the profile's own rounds, and it
 * is repeated here rather than imported because every tested module in lib is
 * dependency-free on purpose. A PPS logged on Monday and a 1st proto backfilled
 * on Tuesday are not in question: that factory is on the PPS.
 *
 * Rows for styles that are not siblings are ignored, rows with no round are
 * ignored, and a sibling with no rounds at all keeps "" — a factory that has
 * not sampled yet has nothing to report, and printing "1st Proto" because a row
 * exists somewhere would be the tool guessing.
 *
 * Returns new objects; the input is not mutated.
 */
export function withLatestRounds(
  siblings: readonly StyleSibling[],
  samples: readonly SiblingSampleLike[],
  order: readonly string[]
): StyleSibling[] {
  const wanted = new Set(siblings.map((s) => s.id));
  // styleId -> the best row seen so far, kept as rank + created_at so one pass
  // is enough however many rounds the studio has logged.
  const best = new Map<string, { rank: number; at: string; round: string; rating: string }>();

  for (const row of samples) {
    if (!row) continue;
    const sid = text(row.style_id);
    if (!sid || !wanted.has(sid)) continue;
    const round = text(row.round);
    if (!round) continue;
    // Anything off the standard list sorts last rather than first, so a one-off
    // round somebody typed by hand never claims to be the furthest on.
    const i = order.indexOf(round);
    const rank = i === -1 ? order.length : i;
    const at = text(row.created_at);
    const cur = best.get(sid);
    if (!cur || rank > cur.rank || (rank === cur.rank && at > cur.at)) {
      // The rating travels with the round it belongs to rather than being
      // gathered separately, so the dot can never describe a different round
      // from the one named beside it.
      best.set(sid, { rank, at, round, rating: text(row.rating) });
    }
  }

  return siblings.map((s) => {
    const hit = best.get(s.id);
    return { ...s, round: hit?.round ?? "", rating: hit?.rating ?? "" };
  });
}
