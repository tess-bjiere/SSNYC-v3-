/**
 * Finding a style in a grid of them — search, and filters.
 *
 * Tess, 2026-08-05: "when looking at thumbnails of styles in development,
 * production etc -- you should be able to sort and filter with logical
 * options" and "add search functionality to styles".
 *
 * Sorting already existed (lib/devSort.ts). Filtering and searching are the
 * other two ways of not scrolling, and they are different from sorting in a way
 * that matters: sorting rearranges everything, filtering and searching HIDE
 * things. lib/devSort.ts states the house rule about that — "nothing is
 * filtered out… a grid that silently drops rows is how work goes missing" — and
 * this file is how that rule survives having a filter. Everything in here is
 * something a person deliberately typed or chose, the choice stays visible on
 * screen while it is in force, and how many rows it is hiding is countable
 * (see `hiddenBy`) so the page can say so out loud.
 *
 * WHAT SEARCH LOOKS AT. Every field somebody might have in their head when they
 * go looking: the name, the style number, the season, the garment, the category,
 * the fabric, the colours, the factory, the designer, the brand, and the notes.
 * Not photographs and not comments — the first has no words and the second is a
 * different question ("what did we say about it") that the drawer answers.
 *
 * HOW IT MATCHES. Words, not substrings of the whole record: "black jacket"
 * finds a black jacket, in either order, because each word has to appear
 * somewhere and neither has to appear in the same field. A single word matches
 * on a prefix — typing "jack" finds the jacket before you finish the word —
 * which is the behaviour of every search box anybody has used, and the reason
 * an exact-substring match would feel broken here.
 *
 * Dependency-free, so it can be unit tested directly and cannot drift with the
 * database types. The caller decides what a style is.
 */

/** The parts of a style this file reads. All optional — old rows are missing most. */
export type SearchableStyle = {
  id?: string | null;
  name?: string | null;
  style_no?: string | null;
  season?: string | null;
  garment?: string | null;
  category?: string | null;
  fabric?: string | null;
  colors?: string | null;
  factory?: string | null;
  designer?: string | null;
  brand?: string | null;
  notes?: string | null;
  // How the current round came back — "good" | "workable" | "poor", or "" for
  // unrated (Tess, 2026-08-09: "missing filter options"). Not a stored style
  // column: the grid augments each row with the rating off its DevSummary before
  // filtering, so filtering by rating and the dot on the card read the same
  // fact. Deliberately absent from the search haystack below — a rating is a
  // thing you filter to, not a word you go looking for.
  rating?: string | null;
};

/**
 * The fields a person filters by, each empty for "no opinion".
 *
 * Was three (season, factory, category). Tess, 2026-08-09: "missing filter
 * options". Designer and brand are the other two facts a style already carries
 * that somebody narrows by; rating is the studio's traffic light, folded in
 * from the round summary. The set is a list rather than three named fields so
 * adding the next one is one entry here and nothing else — applyFilters,
 * anyFilter and the facets all read the list.
 */
export type FilterField = "season" | "factory" | "category" | "designer" | "brand" | "rating";

export const FILTER_FIELDS: readonly FilterField[] = [
  "season",
  "factory",
  "category",
  "designer",
  "brand",
  "rating",
];

export type StyleFilters = Record<FilterField, string>;

export const NO_FILTERS: StyleFilters = {
  season: "",
  factory: "",
  category: "",
  designer: "",
  brand: "",
  rating: "",
};

/** One value a filter can take, with how many styles carry it. */
export type FacetOption = {
  /** What goes in the select — the value exactly as it is stored. */
  value: string;
  /** How many of the styles offered have it. */
  count: number;
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function fold(v: unknown): string {
  return text(v).toLowerCase();
}

/** Every word in the query, lowercased, in order, with the empties dropped. */
export function searchTerms(query: string | null | undefined): string[] {
  return fold(query)
    .split(/[\s,]+/)
    .filter(Boolean);
}

/** The searchable text of one style, as a single lowercased haystack of words. */
function haystack(s: SearchableStyle): string[] {
  const fields = [
    s.name,
    s.style_no,
    s.season,
    s.garment,
    s.category,
    s.fabric,
    s.colors,
    s.factory,
    s.designer,
    s.brand,
    s.notes,
  ];
  const words: string[] = [];
  for (const f of fields) {
    const t = fold(f);
    if (!t) continue;
    // Split on everything that isn't a letter, digit or dash. A style number is
    // "SS-100" and has to survive whole, because "SS-100" is what somebody
    // types; a slash between colours is a separator and should not.
    for (const w of t.split(/[^a-z0-9\-]+/)) {
      if (w) words.push(w);
    }
    // The whole field too, so a multi-word phrase inside one field ("summer
    // linen") can still be found by typing it with the space in.
    if (t.includes(" ")) words.push(t);
  }
  return words;
}

/** Does this style answer to every word in the query? */
export function matchesSearch(s: SearchableStyle, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const words = haystack(s);
  for (const term of terms) {
    let hit = false;
    for (const w of words) {
      if (w.startsWith(term) || w.includes(term)) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }
  return true;
}

/**
 * The styles matching a typed query.
 *
 * An empty query returns everything, in the order it was given — searching for
 * nothing is not a filter, and reordering an untouched grid would be a
 * surprise.
 */
export function searchStyles<T extends SearchableStyle>(
  styles: readonly T[],
  query: string | null | undefined
): T[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return styles.slice();
  return styles.filter((s) => matchesSearch(s, terms));
}

/**
 * The values actually present in a set of styles, for one field.
 *
 * Only what is there. A season nobody has used is not an option, because an
 * option that returns nothing is a dead end dressed up as a choice. Sorted
 * with the commonest first and ties broken alphabetically, so the list is
 * stable between renders and the useful end of it is at the top.
 */
export function facetOptions(
  styles: readonly SearchableStyle[],
  field: FilterField
): FacetOption[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const s of styles) {
    const raw = text(s[field]);
    if (!raw) continue;
    // Grouped case-insensitively — "Bella" and "bella" are one factory — but
    // displayed as the first spelling seen, because that is what is on the row.
    const key = raw.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { value: raw, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value)
  );
}

/** Is any filter actually in force? */
export function anyFilter(f: StyleFilters, query?: string | null): boolean {
  return Boolean(FILTER_FIELDS.some((k) => text(f[k])) || searchTerms(query).length);
}

/**
 * Apply the chosen filters. Case-insensitive, for the same reason facets are
 * grouped that way. An empty filter is no opinion, never "styles with no season".
 *
 * Reads FILTER_FIELDS rather than three named columns, so every filter — the
 * original three and the ones added since — is ANDed the same way: a style has
 * to answer to all the filters that are set, and a filter that is not set is
 * skipped rather than treated as "must be blank".
 */
export function applyFilters<T extends SearchableStyle>(
  styles: readonly T[],
  f: StyleFilters
): T[] {
  const active = FILTER_FIELDS.map((k) => [k, fold(f[k])] as const).filter(([, v]) => v);
  if (active.length === 0) return styles.slice();
  return styles.filter((s) => active.every(([k, v]) => fold(s[k]) === v));
}

/** Search and filter together, in that order. Search is the coarser sieve. */
export function findStyles<T extends SearchableStyle>(
  styles: readonly T[],
  query: string | null | undefined,
  f: StyleFilters
): T[] {
  return applyFilters(searchStyles(styles, query), f);
}

/**
 * How many rows the current search and filters are hiding.
 *
 * This exists so the grid can say it. The rule this file has to live with is
 * that work must not go missing quietly; a number on screen is what turns
 * hiding into something a person did on purpose and can undo.
 */
export function hiddenBy(total: number, shown: number): number {
  return Math.max(0, Math.floor(total || 0) - Math.max(0, Math.floor(shown || 0)));
}

/** "3 of 41 styles" / "41 styles" / "No styles". Plain, and honest about both numbers. */
export function resultLabel(total: number, shown: number): string {
  const t = Math.max(0, Math.floor(total || 0));
  const n = Math.max(0, Math.floor(shown || 0));
  if (t === 0) return "No styles";
  if (n === t) return `${t} style${t === 1 ? "" : "s"}`;
  if (n === 0) return `Nothing matches — ${t} style${t === 1 ? "" : "s"} hidden`;
  return `${n} of ${t} styles`;
}
