// "if a style is developed by multiple factories, they should have their own
// profile for each but provide hyperlinks to the other duplicate styles."
//
// The failure worth guarding is a false link — a profile pointing at something
// that is not the same garment. A missing link is an inconvenience; a link from
// this season's anorak to last season's is the tool telling somebody the wrong
// factory is making the thing in front of them.

import test from "node:test";
import assert from "node:assert/strict";

import {
  siblingKey,
  siblingLabel,
  siblingsOf,
  withLatestRounds,
  type SiblingSampleLike,
  type SiblingStyleLike,
} from "./styleSiblings.ts";

const A: SiblingStyleLike = { id: "a", name: "Anorak Jacket", style_no: "SS-100", season: "SS27", factory: "Bella", status: "development" };
const B: SiblingStyleLike = { id: "b", name: "Anorak Jacket", style_no: "SS-100", season: "SS27", factory: "Toni", status: "development" };
const C: SiblingStyleLike = { id: "c", name: "Anorak Jacket", style_no: "SS-100", season: "SS27", factory: "Kavi", status: "production" };

test("the same style number at another factory is a duplicate", () => {
  assert.deepEqual(siblingsOf(A, [A, B]).map((s) => s.id), ["b"]);
  assert.equal(siblingsOf(A, [A, B])[0].factory, "Toni");
  assert.equal(siblingsOf(A, [A, B])[0].matchedOn, "style_no");
  // The relationship goes both ways, without either side being the original.
  assert.deepEqual(siblingsOf(B, [A, B]).map((s) => s.id), ["a"]);
});

test("the list is alphabetical by factory, because that is what you are choosing between", () => {
  assert.deepEqual(siblingsOf(A, [A, B, C]).map((s) => s.factory), ["Kavi", "Toni"]);
});

test("same name, same season, no style number — still a duplicate", () => {
  const x = { id: "x", name: "Silk Shell", season: "AW27", factory: "Bella" };
  const y = { id: "y", name: "silk shell", season: "aw27", factory: "Toni" };
  assert.deepEqual(siblingsOf(x, [x, y]).map((s) => s.id), ["y"]);
  assert.equal(siblingsOf(x, [x, y])[0].matchedOn, "name+season");
});

test("the same name in a different season is a different development, not a duplicate", () => {
  const thisYear = { id: "x", name: "Anorak Jacket", season: "SS27", factory: "Bella" };
  const lastYear = { id: "y", name: "Anorak Jacket", season: "SS26", factory: "Toni" };
  assert.deepEqual(siblingsOf(thisYear, [thisYear, lastYear]), []);
});

test("a name with no season matches nothing — it would match half the library", () => {
  const x = { id: "x", name: "Anorak Jacket", factory: "Bella" };
  const y = { id: "y", name: "Anorak Jacket", factory: "Toni" };
  assert.equal(siblingKey(x), "");
  assert.deepEqual(siblingsOf(x, [x, y]), []);
});

test("the same factory twice is a re-entry, not a duplicate development", () => {
  const twin = { id: "b2", name: "Anorak Jacket", style_no: "SS-100", season: "SS27", factory: "bella" };
  assert.deepEqual(siblingsOf(A, [A, twin]), []);
  // Case does not make it a second factory.
  assert.deepEqual(siblingsOf(A, [A, twin, B]).map((s) => s.id), ["b"]);
});

test("a blank factory is not a factory, on either side", () => {
  const noFactory = { id: "n", name: "Anorak Jacket", style_no: "SS-100", season: "SS27", factory: "" };
  // The style being read has no factory: nothing to distinguish it from.
  assert.deepEqual(siblingsOf(noFactory, [noFactory, A]), []);
  // The candidate has no factory: a link that cannot say where it goes.
  assert.deepEqual(siblingsOf(A, [A, noFactory]), []);
});

test("a style is never its own sibling", () => {
  assert.deepEqual(siblingsOf(A, [A]), []);
  assert.deepEqual(siblingsOf(A, [A, A]), []);
});

test("a style the studio has stopped reading is not linked to", () => {
  const gone = { ...B, deleted_at: "2026-01-01T00:00:00Z" };
  assert.deepEqual(siblingsOf(A, [A, gone]), []);
});

test("the label reads as a sentence at one, two and three factories", () => {
  assert.equal(siblingLabel([]), "");
  assert.equal(siblingLabel(siblingsOf(A, [A, B])), "Also in development with Toni");
  assert.equal(siblingLabel(siblingsOf(A, [A, B, C])), "Also in development with Kavi and Toni");
  const D = { id: "d", name: "Anorak Jacket", style_no: "SS-100", season: "SS27", factory: "Ada" };
  assert.equal(siblingLabel(siblingsOf(A, [A, B, C, D])), "Also in development with Ada, Kavi and Toni");
});

// The round each sibling is on, which is what the pill beside the factory name
// says (Tess, 2026-08-05: "put the sample round (eg 2nd proto) instead of
// development next to name"). The failure to guard is the tool claiming a
// factory is further on than it is.
const ORDER = ["proto1", "proto2", "proto3", "sms", "pps1", "pps2", "bulk"];

test("a sibling carries the round it is furthest along, not the one typed last", () => {
  const rows: SiblingSampleLike[] = [
    { style_id: "b", round: "sms", created_at: "2026-06-01" },
    // Backfilled a day later. It is earlier in the cycle, so it does not win.
    { style_id: "b", round: "proto1", created_at: "2026-06-02" },
  ];
  const out = withLatestRounds(siblingsOf(A, [A, B]), rows, ORDER);
  assert.equal(out[0].round, "sms");
});

test("rounds belonging to other styles are ignored", () => {
  const rows: SiblingSampleLike[] = [
    { style_id: "a", round: "bulk", created_at: "2026-06-01" },
    { style_id: "z", round: "bulk", created_at: "2026-06-01" },
    { style_id: "b", round: "proto2", created_at: "2026-06-01" },
  ];
  const out = withLatestRounds(siblingsOf(A, [A, B]), rows, ORDER);
  assert.equal(out[0].round, "proto2");
});

test("a factory that has logged no rounds says nothing rather than guessing", () => {
  const out = withLatestRounds(siblingsOf(A, [A, B]), [], ORDER);
  assert.equal(out[0].round, "");
  // The link itself still stands — the factory name is the reason to click.
  assert.equal(out[0].factory, "Toni");
});

test("a round typed by hand never claims to be the furthest on", () => {
  const rows: SiblingSampleLike[] = [
    { style_id: "b", round: "proto2", created_at: "2026-06-01" },
    { style_id: "b", round: "fit sample", created_at: "2026-06-02" },
  ];
  const out = withLatestRounds(siblingsOf(A, [A, B]), rows, ORDER);
  // "fit sample" is not in the standard list, so it ranks last in the cycle —
  // but it is the only thing after proto2, so it is what that factory is on.
  assert.equal(out[0].round, "fit sample");
});

test("withLatestRounds does not mutate what it was given", () => {
  const base = siblingsOf(A, [A, B]);
  withLatestRounds(base, [{ style_id: "b", round: "bulk" }], ORDER);
  assert.equal(base[0].round, "");
});

// --- The colour dot (Tess, 2026-08-06: "this should have color dot on what the
// last round received was") -------------------------------------------------

test("the rating carried is the one on the round that is named, not the newest row", () => {
  const rows: SiblingSampleLike[] = [
    { style_id: "b", round: "sms", created_at: "2026-05-01", rating: "poor" },
    { style_id: "b", round: "proto1", created_at: "2026-07-01", rating: "good" },
  ];
  const out = withLatestRounds(siblingsOf(A, [A, B]), rows, ORDER);
  // The SMS is further through the cycle, so it is the round on the pill — and
  // the dot has to be its rating, not the newer proto's.
  assert.equal(out[0].round, "sms");
  assert.equal(out[0].rating, "poor");
});

test("an unrated round draws no dot rather than a grey one", () => {
  const rows: SiblingSampleLike[] = [{ style_id: "b", round: "proto2", created_at: "2026-06-01" }];
  const out = withLatestRounds(siblingsOf(A, [A, B]), rows, ORDER);
  assert.equal(out[0].round, "proto2");
  assert.equal(out[0].rating, "");
});

test("a factory with no rounds at all has no rating either", () => {
  const out = withLatestRounds(siblingsOf(A, [A, B]), [], ORDER);
  assert.equal(out[0].rating, "");
});

test("siblingsOf starts every link unrated until the samples are read", () => {
  assert.equal(siblingsOf(A, [A, B])[0].rating, "");
});
