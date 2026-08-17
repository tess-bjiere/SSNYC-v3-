import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPhotographerDirectory, groupByGeo, NO_CITY } from "./photographers.ts";

test("groups a photographer's work by city and aggregates their profile", () => {
  const { cities, photographers } = buildPhotographerDirectory([
    { id: "1", photographer: "Ada Lovelace", photographer_ig: "@ada", location: "Paris", designer: "Lemaire" },
    { id: "2", photographer: "Ada Lovelace", location: "Paris", designer: "The Row" },
    { id: "3", photographer: "Ada Lovelace", location: "New York", designer: "Lemaire" },
  ]);

  // One profile, across two cities, holding all three images.
  assert.equal(photographers.length, 1);
  assert.deepEqual(photographers[0].cities, ["New York", "Paris"]);
  assert.deepEqual(photographers[0].ids.sort(), ["1", "2", "3"]);
  // IG is carried through from the one image that had it.
  assert.equal(photographers[0].ig, "@ada");
  // "Shot for" is the distinct brands across their images, deduped and sorted.
  assert.deepEqual(photographers[0].shotFor, ["Lemaire", "The Row"]);

  // Two city groups; Paris has two of Ada's shots, New York one.
  const paris = cities.find((c) => c.city === "Paris")!;
  assert.equal(paris.count, 2);
  assert.deepEqual(paris.photographers[0].ids.sort(), ["1", "2"]);
});

test("an image with no photographer is skipped; one with no city is filed, not dropped", () => {
  const { cities, photographers } = buildPhotographerDirectory([
    { id: "1", photographer: "", location: "Paris" }, // no person → skipped
    { id: "2", photographer: "Unknown", location: "Paris" }, // not a real name → skipped
    { id: "3", photographer: "Bea", location: "" }, // no city → NO_CITY bucket
  ]);
  assert.equal(photographers.length, 1);
  assert.equal(photographers[0].name, "Bea");
  const bucket = cities.find((c) => c.city === NO_CITY)!;
  assert.equal(bucket.located, false);
  assert.deepEqual(bucket.photographers[0].ids, ["3"]);
});

test("cities sort busiest first, and the no-city bucket is always last", () => {
  const { cities } = buildPhotographerDirectory([
    { id: "1", photographer: "A", location: "Milan" },
    { id: "2", photographer: "B", location: "Paris" },
    { id: "3", photographer: "C", location: "Paris" },
    { id: "4", photographer: "D", location: "" },
  ]);
  assert.deepEqual(cities.map((c) => c.city), ["Paris", "Milan", NO_CITY]);
});

test("photographers within a city rank by how much of their work is there", () => {
  const { cities } = buildPhotographerDirectory([
    { id: "1", photographer: "Solo", location: "LA" },
    { id: "2", photographer: "Busy", location: "LA" },
    { id: "3", photographer: "Busy", location: "LA" },
  ]);
  const la = cities.find((c) => c.city === "LA")!;
  assert.deepEqual(la.photographers.map((p) => p.name), ["Busy", "Solo"]);
});

test("the same name in any case is one photographer", () => {
  const { photographers } = buildPhotographerDirectory([
    { id: "1", photographer: "Ada Lovelace", location: "Paris" },
    { id: "2", photographer: "ada lovelace", location: "Paris" },
  ]);
  assert.equal(photographers.length, 1);
  assert.equal(photographers[0].ids.length, 2);
});

// --- Geographic grouping: continent -> country -> city ---------------------

// A tiny stub geo so the grouping is tested without the real map.
const stubGeo = (city: string): { country: string; continent: string } =>
  ({
    Paris: { country: "France", continent: "Europe" },
    Milan: { country: "Italy", continent: "Europe" },
    "New York": { country: "United States", continent: "North America" },
    "Los Angeles": { country: "United States", continent: "North America" },
  } as Record<string, { country: string; continent: string }>)[city] ?? {
    country: "",
    continent: "Other",
  };

test("cities nest under continent then country, busiest first", () => {
  const { cities } = buildPhotographerDirectory([
    { id: "1", photographer: "A", location: "New York" },
    { id: "2", photographer: "B", location: "New York" },
    { id: "3", photographer: "C", location: "Los Angeles" },
    { id: "4", photographer: "D", location: "Paris" },
    { id: "5", photographer: "E", location: "Milan" },
  ]);
  const geo = groupByGeo(cities, stubGeo);

  // North America has 3 images, Europe 2 → NA first.
  assert.deepEqual(geo.map((c) => c.continent), ["North America", "Europe"]);

  // Within North America, one country (US) holding two cities, NY before LA.
  const na = geo[0];
  assert.deepEqual(na.countries.map((c) => c.country), ["United States"]);
  assert.deepEqual(na.countries[0].cities.map((c) => c.city), ["New York", "Los Angeles"]);

  // Europe splits into France and Italy.
  assert.deepEqual(geo[1].countries.map((c) => c.country).sort(), ["France", "Italy"]);
});

test("an unknown city groups under 'Other'; the no-city bucket goes to 'Unspecified' last", () => {
  const { cities } = buildPhotographerDirectory([
    { id: "1", photographer: "A", location: "Paris" },
    { id: "2", photographer: "B", location: "Narnia" },
    { id: "3", photographer: "C", location: "" },
  ]);
  const geo = groupByGeo(cities, stubGeo);
  const names = geo.map((c) => c.continent);
  assert.equal(names[names.length - 1], "Unspecified");
  assert.ok(names.includes("Other"));
  // The unknown city has no country, so it groups directly (empty country key).
  const other = geo.find((c) => c.continent === "Other")!;
  assert.equal(other.countries[0].country, "");
});
