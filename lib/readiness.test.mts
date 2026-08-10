import test from "node:test";
import assert from "node:assert/strict";
import { readiness, summarize, type ReadinessInput } from "./readiness.ts";

// The state the app is in today: preview mode, no keys, database wide open.
const TODAY: ReadinessInput = {
  devBypassActive: true,
  devBypassRefused: false,
  hasServiceRoleKey: false,
  anonCanReadPrivateTable: true,
  hasMailer: false,
  hasImagegen: false,
  hasWipEmail: false,
  hasWipKey: false,
};

// Everything done.
const LIVE: ReadinessInput = {
  devBypassActive: false,
  devBypassRefused: false,
  hasServiceRoleKey: true,
  anonCanReadPrivateTable: false,
  hasMailer: true,
  hasImagegen: true,
  hasWipEmail: true,
  hasWipKey: true,
};

const by = (input: ReadinessInput, id: string) => {
  const c = readiness(input).find((x) => x.id === id);
  assert.ok(c, `no check with id ${id}`);
  return c;
};

test("today's state has nothing confirmed and everything to do", () => {
  const s = summarize(readiness(TODAY));
  assert.equal(s.ready, 0);
  assert.equal(s.clear, false);
  assert.equal(s.outstanding + s.toConfirm, s.total);
});

test("a fully configured deployment is clear, with the unseeable one left to confirm", () => {
  const s = summarize(readiness(LIVE));
  assert.equal(s.outstanding, 0);
  assert.equal(s.clear, true);
  // Backups are not observable from inside the app, so the honest report is
  // "nothing I can check is wrong", never "you are done".
  assert.equal(s.toConfirm, 1);
  assert.match(s.headline, /nothing left that the app can check\. 1 for you to confirm/);
});

test("the optional checks never gate go-live", () => {
  // Mail and image generation off, everything else done.
  const s = summarize(readiness({ ...LIVE, hasMailer: false, hasImagegen: false }));
  assert.equal(s.clear, true);
});

test("a check the app could not run counts against you, not for you", () => {
  const input = { ...LIVE, anonCanReadPrivateTable: null } as ReadinessInput;
  const s = summarize(readiness(input));
  assert.equal(s.clear, false);
  assert.equal(s.outstanding, 1);
  assert.equal(by(input, "rls").state, "unknown");
});

test("a manual check is counted apart from a failing one", () => {
  // Both are outstanding work; only one of them is something being wrong.
  const s = summarize(readiness(LIVE));
  assert.equal(by(LIVE, "backups").state, "manual");
  assert.equal(by(LIVE, "backups").blocking, true);
  assert.equal(s.outstanding, 0);
  assert.equal(s.toConfirm, 1);
});

test("open policies are reported as blocked and point at the runbook", () => {
  const c = by(TODAY, "rls");
  assert.equal(c.state, "blocked");
  assert.match(c.action ?? "", /db\/p0-rls\.sql/);
  // The wording has to describe what was actually probed — the reference
  // library, read from outside a session — and not something adjacent.
  assert.match(c.detail, /reference library/);
  assert.match(c.detail, /allows writing/);
});

test("closed policies are reported ready", () => {
  assert.equal(by(LIVE, "rls").state, "ready");
});

test("the bypass being on is called out as unauthenticated access", () => {
  const c = by(TODAY, "bypass");
  assert.equal(c.state, "blocked");
  assert.match(c.detail, /without a password/);
});

test("a refused bypass is still blocked, but says it is not an exposure", () => {
  const c = by({ ...LIVE, devBypassRefused: true }, "bypass");
  assert.equal(c.state, "blocked");
  assert.match(c.detail, /refused it/);
  assert.match(c.detail, /not exposed/);
});

test("the bypass off is the only way that check goes ready", () => {
  assert.equal(by(LIVE, "bypass").state, "ready");
  assert.equal(by({ ...LIVE, devBypassActive: true }, "bypass").state, "blocked");
  assert.equal(by({ ...LIVE, devBypassRefused: true }, "bypass").state, "blocked");
});

test("google sign-in cannot be confirmed while the bypass is on", () => {
  assert.equal(by(TODAY, "google").state, "manual");
  assert.equal(by(LIVE, "google").state, "ready");
});

test("the missing service key warns about the ordering, not just the absence", () => {
  const c = by(TODAY, "service-key");
  assert.equal(c.state, "blocked");
  assert.match(c.action ?? "", /other way round/);
});

test("a present service key reports the share pages as scoped", () => {
  const c = by(LIVE, "service-key");
  assert.equal(c.state, "ready");
  assert.match(c.detail, /scoped to the one id/);
});

test("mail and imagegen degrade rather than fail, and say so", () => {
  assert.match(by(TODAY, "mail").detail, /nothing is lost/);
  assert.match(by(TODAY, "imagegen").detail, /still produce the written brief/);
});

test("a configured imagegen still carries the untested-request-body caveat", () => {
  assert.match(by(LIVE, "imagegen").action ?? "", /never been sent to a live endpoint/);
});

test("every check has a stable id, a title and a detail", () => {
  const checks = readiness(TODAY);
  const ids = checks.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  for (const c of checks) {
    assert.ok(c.title.length > 0);
    assert.ok(c.detail.length > 0);
  }
});

test("every not-ready check tells you what to do about it", () => {
  for (const input of [TODAY, LIVE, { ...LIVE, anonCanReadPrivateTable: null }] as ReadinessInput[]) {
    for (const c of readiness(input)) {
      if (c.state !== "ready") {
        assert.ok(c.action, `${c.id} is ${c.state} with no action`);
      }
    }
  }
});

test("the check order is fixed, so the page does not reshuffle between loads", () => {
  const a = readiness(TODAY).map((c) => c.id);
  const b = readiness(LIVE).map((c) => c.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["google", "bypass", "service-key", "rls", "backups", "mail", "imagegen", "wip"]);
});

test("the headline counts only blocking checks", () => {
  const checks = readiness(TODAY);
  const s = summarize(checks);
  assert.equal(s.total, checks.filter((c) => c.blocking).length);
  assert.equal(s.total, 5);
  // Today: three observed wrong (bypass, service key, policies) and two that
  // nothing in the app can see — backups, and Google sign-in, which cannot be
  // confirmed while the bypass means nobody has ever used it.
  assert.match(s.headline, /0 of 5 confirmed, 3 to go/);
  assert.equal(s.outstanding, 3);
  assert.equal(s.toConfirm, 2);
});

// --- Pull from WIP ---------------------------------------------------------
//
// Three states rather than two. The half-set one is the whole reason this check
// exists: Vercel shows a Google variable, the app says there are no Google
// credentials, and both are telling the truth about different things.

test("no Google credentials is a thing to set up, not a thing that is broken", () => {
  const c = by(TODAY, "wip");
  assert.equal(c.state, "manual");
  assert.equal(c.blocking, false);
  // The fallback is the point: the feature is not down, only the fetch.
  assert.match(c.detail, /pasted in rather than fetched/);
});

test("an address with no key is called out as half set, and named", () => {
  const c = by({ ...TODAY, hasWipEmail: true }, "wip");
  assert.equal(c.state, "blocked");
  assert.match(c.detail, /GOOGLE_SA_PRIVATE_KEY is not/);
});

test("a key with no address is the same failure the other way round", () => {
  const c = by({ ...TODAY, hasWipKey: true }, "wip");
  assert.equal(c.state, "blocked");
  assert.match(c.detail, /GOOGLE_SA_EMAIL is not/);
});

test("both set reads as ready and still mentions sharing the file", () => {
  const c = by(LIVE, "wip");
  assert.equal(c.state, "ready");
  // Configured and permitted are different, and the second one is the failure
  // people hit next.
  assert.match(c.action ?? "", /Viewer/);
});

test("the WIP check never gates the team getting in", () => {
  for (const input of [TODAY, LIVE, { ...TODAY, hasWipEmail: true }]) {
    assert.equal(by(input, "wip").blocking, false);
  }
});
