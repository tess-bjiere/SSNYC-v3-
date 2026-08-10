import test from "node:test";
import assert from "node:assert/strict";

import {
  compareStanding,
  joinNames,
  ratingScore,
  type StandingSide,
} from "./styleStanding.ts";

function side(
  factory: string,
  rating = "",
  rank = -1,
  roundLabel = rank >= 0 ? `Round ${rank}` : ""
): StandingSide {
  return { factory, rating, rank, roundLabel };
}

test("ratingScore orders the three words and ignores anything else", () => {
  assert.equal(ratingScore("good") > ratingScore("workable"), true);
  assert.equal(ratingScore("workable") > ratingScore("poor"), true);
  assert.equal(ratingScore("poor") > 0, true);
  assert.equal(ratingScore(""), 0);
  assert.equal(ratingScore("GOOD"), ratingScore("good"));
  assert.equal(ratingScore("lovely"), 0);
});

test("joinNames reads as a sentence at one, two and three", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Bella"]), "Bella");
  assert.equal(joinNames(["Bella", "Kavi"]), "Bella and Kavi");
  assert.equal(joinNames(["Bella", "Kavi", "Toni"]), "Bella, Kavi and Toni");
});

test("no siblings means no comparison at all", () => {
  assert.equal(compareStanding(side("Mine", "good", 1), []), null);
});

test("best when nothing else rated higher and something rated lower", () => {
  const r = compareStanding(side("Mine", "good", 1, "1st Proto"), [
    side("Bella", "poor", 1, "1st Proto"),
  ]);
  assert.ok(r);
  assert.equal(r.verdict, "best");
  assert.equal(r.fact, "Best of 2");
  assert.equal(r.attention, false);
  // Tess, 2026-08-07: "remove ... The best of the 2". The verdict is still
  // computed and still drives the chip; the sentence no longer opens by
  // announcing its own conclusion, it just states the comparison.
  assert.equal(r.sentence.startsWith("This sample rated good"), true);
  assert.ok(!/best of the/i.test(r.sentence));
  assert.match(r.sentence, /poor at Bella/);
});

test("worst is flagged for attention", () => {
  const r = compareStanding(side("Mine", "poor", 1, "1st Proto"), [
    side("Bella", "good", 1, "1st Proto"),
  ]);
  assert.ok(r);
  assert.equal(r.verdict, "worst");
  assert.equal(r.attention, true);
  assert.equal(r.fact, "Weakest of 2");
});

test("same when every rated factory came out the same", () => {
  const r = compareStanding(side("Mine", "workable", 2, "2nd Proto"), [
    side("Bella", "workable", 2, "2nd Proto"),
    side("Kavi", "workable", 2, "2nd Proto"),
  ]);
  assert.ok(r);
  assert.equal(r.verdict, "same");
  assert.equal(r.fact, "Level with 2");
  assert.match(r.progress, /All 3 are on 2nd Proto/);
});

test("mixed when better than one and worse than another", () => {
  const r = compareStanding(side("Mine", "workable", 1), [
    side("Bella", "good", 1),
    side("Kavi", "poor", 1),
  ]);
  assert.ok(r);
  assert.equal(r.verdict, "mixed");
  assert.equal(r.fact, "Middle of 3");
  assert.equal(r.attention, false);
});

test("an unrated sibling is named, not scored", () => {
  const r = compareStanding(side("Mine", "good", 1), [
    side("Bella", "poor", 1),
    side("Kavi", "", 1),
  ]);
  assert.ok(r);
  // Kavi must not have dragged the verdict about, and must still be mentioned.
  assert.equal(r.verdict, "best");
  assert.match(r.sentence, /Kavi has not been rated/);
});

test("with nothing rated anywhere the verdict is progress, and says so", () => {
  const r = compareStanding(side("Mine", "", 3, "PPS"), [side("Bella", "", 1, "1st Proto")]);
  assert.ok(r);
  assert.equal(r.verdict, "progress");
  assert.equal(r.fact, "Furthest of 2");
  assert.match(r.sentence, /Bella is on 1st Proto/);
  assert.match(r.sentence, /progress, not quality/);
});

test("behind on the cycle names who is ahead", () => {
  const r = compareStanding(side("Mine", "", 1, "1st Proto"), [side("Bella", "", 3, "PPS")]);
  assert.ok(r);
  assert.equal(r.verdict, "progress");
  assert.equal(r.fact, "Behind Bella");
  assert.match(r.sentence, /Behind on the cycle/);
});

test("no round logged here still compares, and does not pretend to a rating", () => {
  const r = compareStanding(side("Mine", "", -1), [side("Bella", "", 2, "2nd Proto")]);
  assert.ok(r);
  assert.match(r.sentence, /No sample logged here yet/);
});

test("nothing on either side is null, not an empty verdict", () => {
  assert.equal(compareStanding(side("Mine"), [side("Bella")]), null);
});

test("a rating here and none anywhere else falls back to progress honestly", () => {
  const r = compareStanding(side("Mine", "good", 2, "2nd Proto"), [
    side("Bella", "", 1, "1st Proto"),
  ]);
  assert.ok(r);
  assert.equal(r.verdict, "progress");
  assert.match(r.sentence, /nobody has rated the other/);
});
