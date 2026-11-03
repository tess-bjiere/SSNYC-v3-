import { test } from "node:test";
import assert from "node:assert/strict";
import { creditFor, instagramUrl, isInstagram, PEOPLE } from "./people.ts";
import { buildPhotographerDirectory } from "./photographers.ts";

// A model row's `photographer` is who took the picture. If the models directory
// read that column it would file Fei Fei Sun's photo under Christopher Macsurak —
// this pins that the model's own name is what a model card is built from.
test("a model row is filed under the model, not the photo credit", () => {
  const row = { id: "1", model: "Fei Fei Sun", photographer: "Christopher Macsurak", photographer_ig: "https://www.instagram.com/macsurak/", location: "New York" };
  const c = creditFor("model", row);
  assert.equal(c.photographer, "Fei Fei Sun");
  assert.equal(c.photographer_ig, null);
  const dir = buildPhotographerDirectory([c]);
  assert.deepEqual(dir.photographers.map((p) => p.name), ["Fei Fei Sun"]);
  assert.equal(dir.cities[0].city, "New York");
});

test("a model's own Instagram rides in link", () => {
  const c = creditFor("model", { id: "1", model: "Ana", link: "https://www.instagram.com/ana/" });
  assert.equal(c.photographer_ig, "https://www.instagram.com/ana/");
  assert.equal(creditFor("model", { id: "2", model: "Ana", link: "https://agency.com/ana" }).photographer_ig, null);
});

test("the photographer directory reads rows exactly as before", () => {
  const row = { id: "1", photographer: "Drew Vickers", photographer_ig: "x", model: "Irina Shayk", location: "Paris", designer: "PRINT" };
  assert.deepEqual(creditFor("photographer", row), {
    id: "1", photographer: "Drew Vickers", photographer_ig: "x", location: "Paris", designer: "PRINT",
  });
});

// The two directories must never share a row type, or a casting photo would turn
// up as a photographer's work (and the roster would turn up on the models page).
test("photographer and model directories read disjoint row types", () => {
  const a = new Set(PEOPLE.photographer.rowTypes);
  assert.equal(PEOPLE.model.rowTypes.some((t) => a.has(t)), false);
  assert.ok(a.has(PEOPLE.photographer.ownType));
  assert.ok(PEOPLE.model.rowTypes.includes(PEOPLE.model.ownType));
});

test("instagram handles normalise to the stored URL form", () => {
  assert.equal(instagramUrl("@emily.lipson"), "https://www.instagram.com/emily.lipson/");
  assert.equal(instagramUrl("emily.lipson"), "https://www.instagram.com/emily.lipson/");
  assert.equal(instagramUrl("instagram.com/emily.lipson"), "https://www.instagram.com/emily.lipson/");
  assert.equal(instagramUrl("https://www.instagram.com/emily.lipson/?hl=en"), "https://www.instagram.com/emily.lipson/");
  assert.equal(instagramUrl("ryanmariehelfant.com"), "ryanmariehelfant.com");
  assert.equal(instagramUrl("  "), "");
  assert.equal(isInstagram("@ana"), true);
  assert.equal(isInstagram("https://parker-woods.com/"), false);
});
