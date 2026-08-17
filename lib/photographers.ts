/**
 * The photographer directory, built from campaign (editorial) credits.
 *
 * Tess, 2026-08-17: "have an easy way to see photographers in different
 * locations and look at their work ... easy to get to a list of people /
 * profiles in different cities." A huge part of FRED's marketing is finding a
 * photographer in a given city and looking at their work.
 *
 * There is no photographer TABLE — a photographer is just a name that recurs on
 * campaign images, each of which already carries the person, their Instagram and
 * the city it was shot in. This module turns that flat list into two shapes:
 *
 *   cities        every city, and within it the photographers who have shot
 *                 there — the "by city" browse.
 *   photographers one aggregate per person across every city — what a profile
 *                 opens onto: their whole body of work and where it was made.
 *
 * It works on a structural subset of a reference so it stays pure and testable
 * (no import of the Reference type, no image-URL logic — the caller maps the ids
 * back to rows for thumbnails). Dependency-free on purpose.
 */

export type PhotoCredit = {
  id: string;
  photographer?: string | null;
  photographer_ig?: string | null;
  location?: string | null;
};

/** One photographer as they appear within a single city. */
export type PhotographerInCity = {
  /** Lower-cased name, for React keys and matching. */
  key: string;
  /** The name as first written. */
  name: string;
  ig: string | null;
  /** Image ids by this photographer IN THIS city, newest-first order preserved. */
  ids: string[];
};

export type CityGroup = {
  /** Display city; the placeholder below when an image has no location. */
  city: string;
  /** False only for the no-location bucket, so the UI can treat it quietly. */
  located: boolean;
  photographers: PhotographerInCity[];
  /** Total images filed in this city. */
  count: number;
};

/** One photographer across everything they have shot — what a profile shows. */
export type PhotographerProfile = {
  key: string;
  name: string;
  ig: string | null;
  /** Distinct cities they have shot in, located ones first, then any placeholder. */
  cities: string[];
  /** Every image id by this photographer, across all cities. */
  ids: string[];
};

/** What an image with no city is filed under, so nobody's work disappears just
 *  because the location was left blank. */
export const NO_CITY = "Unspecified city";

// Values that are not a real person and should not become a photographer card.
const NOT_A_NAME = new Set(["", "unknown", "n/a", "na", "none", "-", "?"]);

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isRealName(name: string): boolean {
  return name.length > 0 && !NOT_A_NAME.has(name.toLowerCase());
}

/**
 * Build the directory. Order is deterministic and meaningful:
 *   cities        by how many images were shot there (busiest first), ties
 *                 alphabetical; the no-location bucket always last.
 *   photographers within a city, by how much of their work is there, ties by
 *                 name; across the whole directory, by name.
 * An image with no real photographer is skipped; one with no city lands in the
 * NO_CITY bucket rather than being dropped.
 */
export function buildPhotographerDirectory(items: readonly PhotoCredit[]): {
  cities: CityGroup[];
  photographers: PhotographerProfile[];
} {
  // key -> profile (across all cities)
  const profiles = new Map<string, PhotographerProfile & { citySet: Set<string> }>();
  // cityDisplay -> (key -> in-city entry)
  const cities = new Map<string, { located: boolean; people: Map<string, PhotographerInCity> }>();

  for (const it of items ?? []) {
    const id = clean(it.id);
    const name = clean(it.photographer);
    if (!id || !isRealName(name)) continue;
    const key = name.toLowerCase();
    const ig = clean(it.photographer_ig) || null;
    const loc = clean(it.location);
    const cityDisplay = loc || NO_CITY;
    const located = loc.length > 0;

    // profile
    let p = profiles.get(key);
    if (!p) {
      p = { key, name, ig, cities: [], ids: [], citySet: new Set() };
      profiles.set(key, p);
    }
    if (!p.ig && ig) p.ig = ig;
    p.ids.push(id);
    p.citySet.add(cityDisplay);

    // city -> person
    let c = cities.get(cityDisplay);
    if (!c) {
      c = { located, people: new Map() };
      cities.set(cityDisplay, c);
    }
    let entry = c.people.get(key);
    if (!entry) {
      entry = { key, name, ig, ids: [] };
      c.people.set(key, entry);
    }
    if (!entry.ig && ig) entry.ig = ig;
    entry.ids.push(id);
  }

  // finalize profiles: cities list (located first, NO_CITY last), sorted names
  const photographers: PhotographerProfile[] = Array.from(profiles.values())
    .map((p) => {
      const list = Array.from(p.citySet);
      list.sort((a, b) => {
        if (a === NO_CITY) return 1;
        if (b === NO_CITY) return -1;
        return a.localeCompare(b);
      });
      return { key: p.key, name: p.name, ig: p.ig, cities: list, ids: p.ids };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // finalize cities
  const cityGroups: CityGroup[] = Array.from(cities.entries())
    .map(([city, c]) => {
      const photographers = Array.from(c.people.values()).sort(
        (a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name)
      );
      const count = photographers.reduce((n, ph) => n + ph.ids.length, 0);
      return { city, located: c.located, photographers, count };
    })
    .sort((a, b) => {
      if (!a.located && b.located) return 1; // NO_CITY last
      if (a.located && !b.located) return -1;
      return b.count - a.count || a.city.localeCompare(b.city);
    });

  return { cities: cityGroups, photographers };
}
