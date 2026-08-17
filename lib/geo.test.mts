import { test } from "node:test";
import assert from "node:assert/strict";
import { cityGeo } from "./geo.ts";

test("known fashion cities resolve to country and continent", () => {
  assert.deepEqual(cityGeo("Paris"), { country: "France", continent: "Europe" });
  assert.deepEqual(cityGeo("new york"), { country: "United States", continent: "North America" });
  assert.deepEqual(cityGeo("Tokyo"), { country: "Japan", continent: "Asia" });
});

test("case and common aliases are handled", () => {
  assert.equal(cityGeo("PARIS").country, "France");
  assert.deepEqual(cityGeo("NYC"), cityGeo("New York"));
  assert.deepEqual(cityGeo("LA"), cityGeo("Los Angeles"));
});

test("an unknown city keeps appearing — no country, 'Other' continent", () => {
  assert.deepEqual(cityGeo("Narnia"), { country: "", continent: "Other" });
  assert.deepEqual(cityGeo(""), { country: "", continent: "Other" });
  assert.deepEqual(cityGeo(null), { country: "", continent: "Other" });
});
