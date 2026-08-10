import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysBetween,
  gapsBetweenRounds,
  latestRound,
  summarizeStyle,
  turnarounds,
  type SummaryRound,
} from "./styleSummary.ts";

const TODAY = "2026-08-05";

function round(o: number, label: string, r: Partial<SummaryRound> = {}): SummaryRound {
  return { label, order: o, ...r };
}

test("days are counted in whole UTC days, and rubbish counts as nothing", () => {
  assert.equal(daysBetween("2026-06-01", "2026-06-12"), 11);
  assert.equal(daysBetween("2026-06-12", "2026-06-01"), -11);
  assert.equal(daysBetween("2026-06-01", "2026-06-01"), 0);
  // A timestamp is fine — only the date part is read.
  assert.equal(daysBetween("2026-06-01T23:00:00Z", "2026-06-02"), 1);
  // Across a daylight-saving boundary it is still a whole number of days.
  assert.equal(daysBetween("2026-03-01", "2026-04-01"), 31);
  assert.equal(daysBetween(null, "2026-06-01"), null);
  assert.equal(daysBetween("2026-06-01", undefined), null);
  assert.equal(daysBetween("soon", "2026-06-01"), null);
  assert.equal(daysBetween("", ""), null);
});

test("the latest round is the furthest along the cycle, not the last in the list", () => {
  const rs = [round(3, "SMS"), round(1, "1st Proto"), round(2, "2nd Proto")];
  assert.equal(latestRound(rs)?.label, "SMS");
  assert.equal(latestRound([]), null);
});

test("turnaround is requested to received, and a backwards date is dropped not averaged", () => {
  assert.deepEqual(
    turnarounds([
      round(1, "1st Proto", { requested: "2026-06-01", received: "2026-06-12" }),
      round(2, "2nd Proto", { requested: "2026-06-20", received: "2026-07-01" }),
      // No received date yet — not a zero-day turnaround.
      round(3, "SMS", { requested: "2026-07-10" }),
      // A typo: received before it was asked for. Dropped.
      round(4, "PPS", { requested: "2026-07-20", received: "2026-07-01" }),
    ]),
    [11, 11]
  );
});

test("the gap is one arriving to the next going out, in cycle order", () => {
  // Deliberately out of order in the list — the sort is the point.
  assert.deepEqual(
    gapsBetweenRounds([
      round(2, "2nd Proto", { requested: "2026-06-20", received: "2026-07-01" }),
      round(1, "1st Proto", { requested: "2026-06-01", received: "2026-06-12" }),
      round(3, "SMS", { requested: "2026-07-06" }),
    ]),
    [8, 5]
  );
});

test("a style with no rounds says so, in the words of its own status", () => {
  const inspo = summarizeStyle({ styleStatus: "inspo", rounds: [], today: TODAY });
  assert.match(inspo.headline, /Not in development yet/);
  assert.match(inspo.timing, /nothing to time/);
  assert.deepEqual(inspo.facts, []);
  assert.equal(inspo.attention, false);

  assert.match(
    summarizeStyle({ styleStatus: "development", rounds: [], today: TODAY }).headline,
    /no sample round has been raised/
  );
  assert.match(
    summarizeStyle({ styleStatus: "archived", rounds: [], today: TODAY }).headline,
    /Archived/
  );
});

test("a round that is out reads as waiting, with its ETA judged against today", () => {
  const late = summarizeStyle({
    styleStatus: "development",
    rounds: [round(2, "2nd Proto", { requested: "2026-07-20", eta: "2026-08-01" })],
    today: TODAY,
  });
  assert.equal(late.headline, "Waiting on 2nd Proto — out for 16 days.");
  assert.ok(late.facts.includes("4 days past its ETA"));
  assert.equal(late.attention, true);

  const due = summarizeStyle({
    styleStatus: "development",
    rounds: [round(2, "2nd Proto", { requested: "2026-07-20", eta: "2026-08-09" })],
    today: TODAY,
  });
  assert.ok(due.facts.includes("Due in 4 days"));
  assert.equal(due.attention, false);

  // No ETA is a thing to fix, not a thing to be quiet about — nobody can plan
  // around a sample with no expected date.
  const blind = summarizeStyle({
    styleStatus: "development",
    rounds: [round(2, "2nd Proto", { requested: "2026-07-20" })],
    today: TODAY,
  });
  assert.ok(blind.facts.includes("No ETA recorded"));
  assert.equal(blind.attention, true);
});

test("a round that came back reads as back, and says what is being done with it", () => {
  const s = summarizeStyle({
    styleStatus: "development",
    rounds: [
      round(1, "1st Proto", { requested: "2026-06-01", received: "2026-06-12" }),
      round(2, "2nd Proto", {
        requested: "2026-07-20",
        received: "2026-08-01",
        status: "with designer",
      }),
    ],
    today: TODAY,
  });
  assert.equal(s.headline, "2nd Proto came back 4 days ago — with designer.");
  assert.equal(s.attention, false);
  assert.ok(!s.facts.some((f) => /rounds back/.test(f)));
});

test("a sample that came back and then stopped is the thing worth flagging", () => {
  const s = summarizeStyle({
    styleStatus: "development",
    rounds: [round(2, "2nd Proto", { received: "2026-06-01", status: "needs to fit" })],
    today: TODAY,
  });
  assert.equal(s.attention, true);
  assert.ok(s.facts.some((f) => f.startsWith("No movement in 65 days")));

  // Unless it has been called off, in which case sitting still is correct.
  const dropped = summarizeStyle({
    styleStatus: "development",
    rounds: [round(2, "2nd Proto", { received: "2026-06-01", status: "not moving forward" })],
    today: TODAY,
  });
  assert.equal(dropped.attention, false);
});

test("timing refuses to average one number, and says so plainly", () => {
  const none = summarizeStyle({
    styleStatus: "development",
    rounds: [round(1, "1st Proto", { requested: "2026-07-01" })],
    today: TODAY,
  });
  assert.match(none.timing, /Not enough dates yet/);

  const one = summarizeStyle({
    styleStatus: "development",
    rounds: [round(1, "1st Proto", { requested: "2026-06-01", received: "2026-06-12" })],
    today: TODAY,
  });
  assert.match(one.timing, /One round measured so far: it took 11 days/);
});

test("two rounds or more give an average and a gap, and no combined figure", () => {
  const s = summarizeStyle({
    styleStatus: "development",
    rounds: [
      round(1, "1st Proto", { requested: "2026-06-01", received: "2026-06-12" }),
      round(2, "2nd Proto", { requested: "2026-06-20", received: "2026-07-01" }),
    ],
    today: TODAY,
  });
  assert.match(s.timing, /about 11 days to come back, across 2 rounds/);
  assert.match(s.timing, /The next round went out 8 days after the last one arrived/);
  // Tess, 2026-08-07: "remove ≈ 22 days a round, end to end". The two halves
  // are stated above in units somebody can act on; adding them together made a
  // number that looked more precise than either and matched nothing on screen.
  assert.ok(!s.facts.some((f) => f.includes("end to end")));
});

test("one day is one day, never 1 days", () => {
  const s = summarizeStyle({
    styleStatus: "development",
    rounds: [round(1, "1st Proto", { requested: "2026-08-03", received: "2026-08-04" })],
    today: TODAY,
  });
  assert.match(s.timing, /it took 1 day to come back/);
  assert.equal(s.headline, "1st Proto came back 1 day ago.");
});

test("a round with no dates at all is an open question, not a silent one", () => {
  const s = summarizeStyle({
    styleStatus: "development",
    rounds: [round(1, "1st Proto")],
    today: TODAY,
  });
  assert.equal(s.headline, "1st Proto is open, with no dates on it yet.");
  assert.equal(s.attention, true);
});
