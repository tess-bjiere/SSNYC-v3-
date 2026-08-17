/**
 * City → country → continent, for organising the photographer directory
 * geographically (Tess, 2026-08-17: "organize photographers by continent and
 * then country / city").
 *
 * The images only store a city name, so this is a curated lookup — the cities a
 * fashion directory actually reaches, plus a few common aliases (NYC, LA). A city
 * we don't know falls back to no country and the "Other" continent rather than
 * being dropped, so nobody's work disappears; add a line here to place it.
 *
 * Pure, dependency-free, and injected into the grouping (lib/photographers.ts)
 * rather than imported by it, so both stay independently testable.
 */

export type Geo = { country: string; continent: string };

const EU = "Europe";
const NA = "North America";
const SA = "South America";
const AS = "Asia";
const AF = "Africa";
const OC = "Oceania";

const MAP: Record<string, Geo> = {
  // Europe
  "paris": { country: "France", continent: EU },
  "milan": { country: "Italy", continent: EU },
  "rome": { country: "Italy", continent: EU },
  "florence": { country: "Italy", continent: EU },
  "london": { country: "United Kingdom", continent: EU },
  "manchester": { country: "United Kingdom", continent: EU },
  "copenhagen": { country: "Denmark", continent: EU },
  "stockholm": { country: "Sweden", continent: EU },
  "gothenburg": { country: "Sweden", continent: EU },
  "oslo": { country: "Norway", continent: EU },
  "helsinki": { country: "Finland", continent: EU },
  "berlin": { country: "Germany", continent: EU },
  "munich": { country: "Germany", continent: EU },
  "antwerp": { country: "Belgium", continent: EU },
  "brussels": { country: "Belgium", continent: EU },
  "amsterdam": { country: "Netherlands", continent: EU },
  "rotterdam": { country: "Netherlands", continent: EU },
  "madrid": { country: "Spain", continent: EU },
  "barcelona": { country: "Spain", continent: EU },
  "lisbon": { country: "Portugal", continent: EU },
  "porto": { country: "Portugal", continent: EU },
  "zurich": { country: "Switzerland", continent: EU },
  "geneva": { country: "Switzerland", continent: EU },
  "vienna": { country: "Austria", continent: EU },
  "athens": { country: "Greece", continent: EU },
  "istanbul": { country: "Turkey", continent: EU },
  "warsaw": { country: "Poland", continent: EU },
  "dublin": { country: "Ireland", continent: EU },
  "reykjavik": { country: "Iceland", continent: EU },

  // North America
  "new york": { country: "United States", continent: NA },
  "brooklyn": { country: "United States", continent: NA },
  "los angeles": { country: "United States", continent: NA },
  "san francisco": { country: "United States", continent: NA },
  "miami": { country: "United States", continent: NA },
  "chicago": { country: "United States", continent: NA },
  "detroit": { country: "United States", continent: NA },
  "atlanta": { country: "United States", continent: NA },
  "toronto": { country: "Canada", continent: NA },
  "montreal": { country: "Canada", continent: NA },
  "vancouver": { country: "Canada", continent: NA },
  "mexico city": { country: "Mexico", continent: NA },

  // South America
  "sao paulo": { country: "Brazil", continent: SA },
  "são paulo": { country: "Brazil", continent: SA },
  "rio de janeiro": { country: "Brazil", continent: SA },
  "buenos aires": { country: "Argentina", continent: SA },
  "bogota": { country: "Colombia", continent: SA },
  "lima": { country: "Peru", continent: SA },

  // Asia / Middle East
  "tokyo": { country: "Japan", continent: AS },
  "osaka": { country: "Japan", continent: AS },
  "kyoto": { country: "Japan", continent: AS },
  "seoul": { country: "South Korea", continent: AS },
  "shanghai": { country: "China", continent: AS },
  "beijing": { country: "China", continent: AS },
  "hong kong": { country: "Hong Kong", continent: AS },
  "taipei": { country: "Taiwan", continent: AS },
  "bangkok": { country: "Thailand", continent: AS },
  "singapore": { country: "Singapore", continent: AS },
  "mumbai": { country: "India", continent: AS },
  "delhi": { country: "India", continent: AS },
  "dubai": { country: "United Arab Emirates", continent: AS },
  "tel aviv": { country: "Israel", continent: AS },

  // Africa
  "lagos": { country: "Nigeria", continent: AF },
  "cape town": { country: "South Africa", continent: AF },
  "johannesburg": { country: "South Africa", continent: AF },
  "marrakech": { country: "Morocco", continent: AF },
  "casablanca": { country: "Morocco", continent: AF },
  "cairo": { country: "Egypt", continent: AF },
  "nairobi": { country: "Kenya", continent: AF },

  // Oceania
  "sydney": { country: "Australia", continent: OC },
  "melbourne": { country: "Australia", continent: OC },
  "auckland": { country: "New Zealand", continent: OC },
};

const ALIASES: Record<string, string> = {
  "nyc": "new york",
  "new york city": "new york",
  "n.y.": "new york",
  "la": "los angeles",
  "l.a.": "los angeles",
  "sf": "san francisco",
  "hk": "hong kong",
  "cdmx": "mexico city",
  "mexico df": "mexico city",
};

/** Where a city sits. An unknown city gets no country and the "Other" continent
 *  — it still appears, it just isn't placed on the map. */
export function cityGeo(city: string | null | undefined): Geo {
  const c = (city ?? "").trim().toLowerCase();
  if (!c) return { country: "", continent: "Other" };
  const key = ALIASES[c] ?? c;
  return MAP[key] ?? { country: "", continent: "Other" };
}
