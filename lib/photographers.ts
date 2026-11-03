/**
 * The photographer directory, built from campaign (editorial) credits.
 *
 * Tess, 2026-08-17: "have an easy way to see photographers in different
 * locations and look at their work ... easy to get to a list of people /
 * profiles in different cities." A huge part of the marketing is finding a
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
  /** The brand on the image — a photographer's "shot for" list is built from these. */
  designer?: string | null;
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

export type CountryGroup = { country: string; cities: CityGroup[]; count: number };
export type ContinentGroup = { continent: string; countries: CountryGroup[]; count: number };

/** One photographer across everything they have shot — what a profile shows. */
export type PhotographerProfile = {
  key: string;
  name: string;
  ig: string | null;
  /** Distinct cities they have shot in, located ones first, then any placeholder. */
  cities: string[];
  /** Distinct brands on their images — the "shot for" client list, derived. */
  shotFor: string[];
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
  const profiles = new Map<
    string,
    PhotographerProfile & { citySet: Set<string>; designerSet: Set<string> }
  >();
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
      p = { key, name, ig, cities: [], shotFor: [], ids: [], citySet: new Set(), designerSet: new Set() };
      profiles.set(key, p);
    }
    if (!p.ig && ig) p.ig = ig;
    p.ids.push(id);
    p.citySet.add(cityDisplay);
    const designer = clean(it.designer);
    if (designer) p.designerSet.add(designer);

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
      const shotFor = Array.from(p.designerSet).sort((a, b) => a.localeCompare(b));
      return { key: p.key, name: p.name, ig: p.ig, cities: list, shotFor, ids: p.ids };
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

/**
 * Arrange the flat city list into continent -> country -> city (Tess,
 * 2026-08-17). The geo lookup is injected so this stays dependency-free; a city
 * with no known country groups directly under its continent (empty country), and
 * the no-location bucket goes to an "Unspecified" continent, always last. Within
 * each level, busiest first, ties alphabetical — the same order the flat view
 * used, so nothing jumps around.
 */
export function groupByGeo(
  cities: readonly CityGroup[],
  geoOf: (city: string) => { country: string; continent: string }
): ContinentGroup[] {
  // continent -> (country -> cities)
  const conts = new Map<string, Map<string, CityGroup[]>>();

  for (const c of cities ?? []) {
    const { continent, country } = c.located
      ? geoOf(c.city)
      : { continent: "Unspecified", country: "" };
    const cont = continent || "Other";
    let countries = conts.get(cont);
    if (!countries) {
      countries = new Map();
      conts.set(cont, countries);
    }
    const arr = countries.get(country) ?? [];
    arr.push(c);
    countries.set(country, arr);
  }

  const count = (cs: readonly CityGroup[]) => cs.reduce((n, c) => n + c.count, 0);
  const special = (name: string) => name === "Unspecified" || name === "Other";

  return Array.from(conts.entries())
    .map(([continent, countries]) => {
      const countryGroups: CountryGroup[] = Array.from(countries.entries())
        .map(([country, cs]) => ({
          country,
          cities: cs.slice().sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)),
          count: count(cs),
        }))
        // Busiest country first; an unknown-country ("") group sits last.
        .sort((a, b) => {
          if (!a.country && b.country) return 1;
          if (a.country && !b.country) return -1;
          return b.count - a.count || a.country.localeCompare(b.country);
        });
      return { continent, countries: countryGroups, count: count(Array.from(countries.values()).flat()) };
    })
    // Busiest continent first; "Other" then "Unspecified" always last.
    .sort((a, b) => {
      if (special(a.continent) !== special(b.continent)) return special(a.continent) ? 1 : -1;
      if (a.continent === "Unspecified") return 1;
      if (b.continent === "Unspecified") return -1;
      return b.count - a.count || a.continent.localeCompare(b.continent);
    });
}

// ---------------------------------------------------------------------------
// The directory from people records (2026-11-02, people phase 1 — see
// lib/peopleRecords.ts). Same shapes as buildPhotographerDirectory, so the page
// draws it unchanged, with two differences that are the point of the records:
//
//   - a person is filed ONCE, under the city they are based in. Before, a card
//     appeared in every city an image of theirs carried, so a photographer with a
//     deck city and an uncity'd Campaign picture showed twice (six did).
//   - the key is the person's id, so a rename never orphans their card.
//
// The cities their pictures were shot in are still there, on the profile, as
// `shotIn`. Someone with no live image left on the board (every row in Trash,
// or their only credit retyped to another name) is not listed — the record and
// card wait, and come back with the first image tagged to them.
// ---------------------------------------------------------------------------

export type DirectoryPerson = {
  id: string;
  name: string;
  city: string | null;
  ig: string | null;
};

export type PeopleProfile = PhotographerProfile & {
  /** Where they are based, "" when unknown. */
  based: string;
  /** Other cities their pictures carry, alphabetical. */
  shotIn: string[];
};

export function buildDirectoryFromPeople(
  people: readonly DirectoryPerson[],
  links: readonly { reference_id: string; person_id: string }[],
  /** The tagged rows, newest first — the order a profile shows. */
  credits: readonly PhotoCredit[]
): { cities: CityGroup[]; photographers: PeopleProfile[] } {
  const byRef = new Map<string, string[]>();
  for (const l of links) {
    const list = byRef.get(l.reference_id) ?? [];
    if (!list.includes(l.person_id)) list.push(l.person_id);
    byRef.set(l.reference_id, list);
  }
  const acc = new Map<string, { ids: string[]; shot: Set<string>; designers: Set<string>; ig: string | null }>();
  for (const c of credits ?? []) {
    const id = clean(c.id);
    if (!id) continue;
    for (const pid of byRef.get(id) ?? []) {
      let a = acc.get(pid);
      if (!a) {
        a = { ids: [], shot: new Set(), designers: new Set(), ig: null };
        acc.set(pid, a);
      }
      if (a.ids.includes(id)) continue;
      a.ids.push(id);
      const loc = clean(c.location);
      if (loc) a.shot.add(loc);
      const d = clean(c.designer);
      if (d) a.designers.add(d);
      if (!a.ig) a.ig = clean(c.photographer_ig) || null;
    }
  }

  const profiles: PeopleProfile[] = [];
  const cities = new Map<string, { located: boolean; people: PhotographerInCity[] }>();
  for (const p of people ?? []) {
    const a = acc.get(p.id);
    if (!a || a.ids.length === 0 || !isRealName(clean(p.name))) continue;
    const based = clean(p.city);
    const cityDisplay = based || NO_CITY;
    const ig = clean(p.ig) || a.ig;
    const shotIn = Array.from(a.shot)
      .filter((c) => c.toLowerCase() !== based.toLowerCase())
      .sort((x, y) => x.localeCompare(y));
    profiles.push({
      key: p.id,
      name: clean(p.name),
      ig,
      cities: [cityDisplay],
      shotFor: Array.from(a.designers).sort((x, y) => x.localeCompare(y)),
      ids: a.ids,
      based,
      shotIn,
    });
    let c = cities.get(cityDisplay);
    if (!c) {
      c = { located: !!based, people: [] };
      cities.set(cityDisplay, c);
    }
    c.people.push({ key: p.id, name: clean(p.name), ig, ids: a.ids });
  }
  profiles.sort((a, b) => a.name.localeCompare(b.name));

  const cityGroups: CityGroup[] = Array.from(cities.entries())
    .map(([city, c]) => {
      const photographers = c.people.sort((a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name));
      const count = photographers.reduce((n, ph) => n + ph.ids.length, 0);
      return { city, located: c.located, photographers, count };
    })
    .sort((a, b) => {
      if (!a.located && b.located) return 1;
      if (a.located && !b.located) return -1;
      return b.count - a.count || a.city.localeCompare(b.city);
    });

  return { cities: cityGroups, photographers: profiles };
}
