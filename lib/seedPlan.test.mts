import { test } from "node:test";
import assert from "node:assert/strict";
import { planArchival, planPeople, findBorrow, type ExistingRow } from "./seedPlan.ts";

const row = (p: Partial<ExistingRow>): ExistingRow => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  type: p.type ?? null,
  image_url: p.image_url ?? null,
  thumb_url: p.thumb_url ?? null,
  photographer: p.photographer ?? null,
  model: p.model ?? null,
  deleted_at: p.deleted_at ?? null,
});

// Running the import twice must not double the Archival wall.
test("archival: an image already imported is not added again", () => {
  const seed = [{ image: "/archival/a.jpg" }, { image: "/archival/b.jpg" }];
  const existing = [row({ type: "archival", image_url: "/archival/a.jpg" })];
  assert.deepEqual(planArchival(seed, existing), [{ image: "/archival/b.jpg" }]);
});

// Someone deleted an imported image on purpose; a second run must not bring it back.
test("archival: an image in Trash stays deleted", () => {
  const seed = [{ image: "/archival/a.jpg" }];
  const existing = [row({ type: "archival", image_url: "/archival/a.jpg", deleted_at: "2026-11-03" })];
  assert.deepEqual(planArchival(seed, existing), []);
});

// The same picture saved on Campaign is a different row: Archival still gets its own.
test("archival: the same file on another page doesn't count", () => {
  const seed = [{ image: "/archival/a.jpg" }];
  const existing = [row({ type: "editorial", image_url: "/archival/a.jpg" })];
  assert.equal(planArchival(seed, existing).length, 1);
});

const P = ["editorial", "roster"] as const;

test("people: one row per image, skipping images the person already has", () => {
  const seeds = [{ name: "Jesse Gouveia", location: "New York", images: [{ src: "/r/1.jpg" }, { src: "/r/2.jpg" }] }];
  const existing = [row({ type: "roster", photographer: "jesse gouveia", image_url: "/r/1.jpg" })];
  const plan = planPeople("photographer", "roster", P, seeds, existing);
  assert.deepEqual(plan.map((p) => p.image_url), ["/r/2.jpg"]);
});

test("people: someone with no pictures gets one name-only row, once", () => {
  const seeds = [{ name: "Talia Chetrit", location: "New York", images: [] }];
  const first = planPeople("photographer", "roster", P, seeds, []);
  assert.equal(first.length, 1);
  assert.equal(first[0].image_url, null);
  const again = planPeople("photographer", "roster", P, seeds, [row({ type: "roster", photographer: "Talia Chetrit" })]);
  assert.equal(again.length, 0);
});

// Mac Scott is on Campaign already and the deck gives no base. A name-only roster
// row would only add a blank second card under "Unspecified city".
test("people: no blank card for someone already on Campaign with no known base", () => {
  const seeds = [{ name: "Mac Scott", location: "", images: [] }];
  const existing = [row({ type: "editorial", photographer: "Mac Scott", image_url: "/c.jpg" })];
  assert.equal(planPeople("photographer", "roster", P, seeds, existing).length, 0);
  // …but with a base, the row places them in that city (the card borrows the cover).
  const based = [{ name: "Mac Scott", location: "New York", images: [] }];
  assert.equal(planPeople("photographer", "roster", P, based, existing).length, 1);
});

// The team removed someone from the directory (all their rows in Trash): an
// import must respect that rather than re-adding them.
test("people: a person removed on purpose is not re-added", () => {
  const seeds = [{ name: "Ana", location: "Paris", images: [{ src: "/r/new.jpg" }] }];
  const existing = [row({ type: "roster", photographer: "Ana", image_url: "/r/old.jpg", deleted_at: "2026-11-03" })];
  assert.deepEqual(planPeople("photographer", "roster", P, seeds, existing), []);
});

// Models are matched on `model`, never on the photo credit.
test("people: models match on the model's name", () => {
  const seeds = [{ name: "Fei Fei Sun", location: "New York", images: [] }];
  const existing = [row({ type: "model", photographer: "Fei Fei Sun" })]; // wrong column
  assert.equal(planPeople("model", "model", ["model"], seeds, existing).length, 1);
  const ok = [row({ type: "model", model: "Fei Fei Sun" })];
  assert.equal(planPeople("model", "model", ["model"], seeds, ok).length, 0);
});

test("borrow: by id, by credited name, Trash included, never from the person's own rows", () => {
  const rows = [
    row({ id: "x", type: "editorial", image_url: "/a.jpg", model: "Alexandra Agoston", photographer: "Chris Colls" }),
    row({ id: "y", type: "editorial", image_url: "/b.jpg", model: "Lucinda Levant", photographer: "Aaron Crossman", deleted_at: "2026-09-15" }),
    row({ id: "z", type: "model", image_url: "/own.jpg", model: "Lucinda Levant" }),
  ];
  assert.equal(findBorrow({ id: "x" }, rows, "model")?.image_url, "/a.jpg");
  assert.equal(findBorrow({ model: "lucinda levant" }, rows, "model")?.image_url, "/b.jpg");
  assert.equal(findBorrow({ photographer: "Aaron Crossman" }, rows, "roster")?.image_url, "/b.jpg");
  assert.equal(findBorrow(undefined, rows, "model"), null);
  // The borrowed model row is credited to whoever took the picture.
  const plan = planPeople("model", "model", ["model"], [{ name: "Lucinda Levant", location: "Sydney", images: [], borrow: { model: "Lucinda Levant" } }], rows.slice(0, 2));
  assert.equal(plan[0].image_url, "/b.jpg");
  assert.equal(plan[0].credit, "Aaron Crossman");
});
