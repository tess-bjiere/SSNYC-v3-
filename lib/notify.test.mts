import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actorName,
  bodyFor,
  buildEmails,
  channelOf,
  excerpt,
  normalizePrefs,
  recipientsFor,
  setPrefs,
  statusLabel,
  subjectFor,
  watchersOf,
  wantsEmail,
  type NotifyEvent,
  type NotifyPrefs,
} from "./notify.ts";

const APP = "https://ssync-two.vercel.app";

const COMMENT: NotifyEvent = {
  kind: "comment",
  styleId: "abc",
  styleName: "Cropped Rib Tank",
  actor: "kara@theloyalist.com",
  body: "Second look on the rise please.",
};

const STATUS: NotifyEvent = {
  kind: "status",
  styleId: "abc",
  styleName: "Cropped Rib Tank",
  actor: "tess@theloyalist.com",
  from: "development",
  to: "production",
};

const RECEIVED: NotifyEvent = {
  kind: "comment_received",
  styleId: "abc",
  styleName: "Cropped Rib Tank",
  actor: "tess@theloyalist.com",
  commentAuthor: "gabby@theloyalist.com",
  commentBody: "Approved for SMS.",
};

const TEAM = ["tess@theloyalist.com", "gabby@theloyalist.com", "kara@theloyalist.com"];

test("a style's watchers are whoever made it and whoever has spoken on it", () => {
  assert.deepEqual(
    watchersOf({ createdBy: "tess@theloyalist.com", commentAuthors: ["gabby@theloyalist.com"] }),
    ["gabby@theloyalist.com", "tess@theloyalist.com"]
  );
});

test("the same person twice, or in two casings, is one watcher", () => {
  // Addresses come from three different tables written over two years; a
  // stray capital should not send anyone a duplicate email.
  assert.deepEqual(
    watchersOf({
      createdBy: "Tess@Theloyalist.com",
      commentAuthors: ["tess@theloyalist.com", " TESS@theloyalist.com "],
    }),
    ["tess@theloyalist.com"]
  );
});

test("a missing or junk author is dropped rather than mailed", () => {
  assert.deepEqual(watchersOf({ createdBy: null, commentAuthors: [null, "", "not-an-email"] }), []);
});

test("nobody is told what they themselves just did", () => {
  // The single fastest way to teach a team to mute a sender.
  assert.deepEqual(recipientsFor(COMMENT, TEAM), [
    "gabby@theloyalist.com",
    "tess@theloyalist.com",
  ]);
});

test("silence means subscribed — a new person hears things", () => {
  assert.equal(wantsEmail({}, "new@theloyalist.com", "comment"), true);
  assert.equal(wantsEmail({}, "new@theloyalist.com", "status"), true);
});

test("only an explicit no is a no, and it is per channel", () => {
  const prefs: NotifyPrefs = { "gabby@theloyalist.com": { comment: false } };
  assert.equal(wantsEmail(prefs, "gabby@theloyalist.com", "comment"), false);
  // Muting comments does not mute a style going into production.
  assert.equal(wantsEmail(prefs, "gabby@theloyalist.com", "status"), true);
  assert.deepEqual(recipientsFor(COMMENT, TEAM, prefs), ["tess@theloyalist.com"]);
});

test("an opt-out is honoured however the address was capitalised", () => {
  const prefs: NotifyPrefs = normalizePrefs({ "Gabby@Theloyalist.com": { comment: false } });
  assert.equal(wantsEmail(prefs, "gabby@theloyalist.com", "comment"), false);
});

test("marking a comment received answers one person, not the room", () => {
  // An answer is not an announcement.
  assert.deepEqual(recipientsFor(RECEIVED, TEAM), ["gabby@theloyalist.com"]);
});

test("marking your own comment received tells nobody", () => {
  const self: NotifyEvent = { ...RECEIVED, actor: "gabby@theloyalist.com" };
  assert.deepEqual(recipientsFor(self, TEAM), []);
});

test("a status change answers to its own switch", () => {
  assert.equal(channelOf(STATUS), "status");
  assert.equal(channelOf(COMMENT), "comment");
  assert.equal(channelOf(RECEIVED), "comment");
});

test("the subject line says the thing instead of promising it", () => {
  assert.equal(subjectFor(COMMENT), "New comment on Cropped Rib Tank");
  assert.equal(subjectFor(STATUS), "Cropped Rib Tank moved to Production");
  assert.equal(subjectFor(RECEIVED), "Your comment on Cropped Rib Tank was marked received");
});

test("a status email says where it came from, not only where it landed", () => {
  const body = bodyFor(STATUS, APP);
  assert.ok(body.includes("moved Cropped Rib Tank from Development to Production."));
  // With no previous status there is nothing to claim it moved from.
  assert.ok(bodyFor({ ...STATUS, from: null }, APP).includes("set Cropped Rib Tank to Production."));
});

test("every email carries a way back to the style", () => {
  for (const event of [COMMENT, STATUS, RECEIVED]) {
    assert.ok(bodyFor(event, APP).includes(`${APP}/styles/abc`), `${event.kind} has no link`);
  }
  // A trailing slash on the configured URL must not produce a double slash.
  assert.ok(bodyFor(COMMENT, APP + "/").includes(`${APP}/styles/abc`));
});

test("a comment email quotes the comment", () => {
  assert.ok(bodyFor(COMMENT, APP).includes("Second look on the rise please."));
});

test("an essay in a comment is cut at a word, not mid-syllable", () => {
  const long = "alpha bravo charlie delta echo foxtrot ".repeat(40);
  const cut = excerpt(long, 60);
  assert.ok(cut.length <= 61, "excerpt overran");
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.includes("  "));
  assert.equal(excerpt("short", 60), "short");
});

test("a person is named, and an unknown one is not guessed at", () => {
  assert.equal(actorName("kara@theloyalist.com"), "kara");
  assert.equal(actorName(null), "Someone");
});

test("an unrecognised status is shown as typed rather than swallowed", () => {
  assert.equal(statusLabel("production"), "Production");
  assert.equal(statusLabel("on hold"), "on hold");
  assert.equal(statusLabel(null), "—");
});

test("one event becomes one message per recipient, all saying the same thing", () => {
  const mails = buildEmails(COMMENT, TEAM, {}, APP);
  assert.deepEqual(mails.map((m) => m.to), ["gabby@theloyalist.com", "tess@theloyalist.com"]);
  assert.equal(new Set(mails.map((m) => m.subject)).size, 1);
  assert.equal(new Set(mails.map((m) => m.text)).size, 1);
});

test("an event nobody wants produces no mail at all", () => {
  // Not an empty send — no send. The shell has nothing to do.
  const prefs: NotifyPrefs = {
    "gabby@theloyalist.com": { comment: false },
    "tess@theloyalist.com": { comment: false },
  };
  assert.deepEqual(buildEmails(COMMENT, TEAM, prefs, APP), []);
  assert.deepEqual(buildEmails(COMMENT, [], {}, APP), []);
});

test("saving one person's switches leaves everyone else's alone", () => {
  // The settings row is shared. A save that overwrites the whole object would
  // silently re-subscribe the person who opted out last week.
  const before: NotifyPrefs = {
    "gabby@theloyalist.com": { comment: false },
    "kara@theloyalist.com": { status: false },
  };
  const after = setPrefs(before, "Tess@theloyalist.com", { status: false });
  assert.deepEqual(after["gabby@theloyalist.com"], { comment: false });
  assert.deepEqual(after["kara@theloyalist.com"], { status: false });
  assert.deepEqual(after["tess@theloyalist.com"], { status: false });
  // and does not mutate what it was given
  assert.equal(before["tess@theloyalist.com"], undefined);
});

test("changing one switch keeps the other one this person already set", () => {
  const after = setPrefs({ "tess@theloyalist.com": { comment: false } }, "tess@theloyalist.com", {
    status: false,
  });
  assert.deepEqual(after["tess@theloyalist.com"], { comment: false, status: false });
});

test("a stored preferences blob is read defensively", () => {
  // This row is hand-editable in the Supabase dashboard and predates nothing —
  // anything could be in it.
  assert.deepEqual(normalizePrefs(null), {});
  assert.deepEqual(normalizePrefs("nope"), {});
  assert.deepEqual(
    normalizePrefs({
      "kara@theloyalist.com": { comment: false, status: true, nonsense: "x" },
      "not-an-email": { comment: false },
      "gabby@theloyalist.com": "yes",
    }),
    { "kara@theloyalist.com": { comment: false, status: true } }
  );
});

test("a mentioned teammate is notified off-watch and past their comment switch", () => {
  // lucas is not a watcher (not in TEAM) and gabby switched comment mail off —
  // both still reach because an @mention is a direct ask. The actor (kara) never
  // hears their own comment.
  const mentioned: NotifyEvent = { ...COMMENT, mentions: ["lucas@theloyalist.com", "gabby@theloyalist.com"] };
  const prefs: NotifyPrefs = { "gabby@theloyalist.com": { comment: false } };
  assert.deepEqual(recipientsFor(mentioned, TEAM, prefs), [
    "gabby@theloyalist.com",
    "lucas@theloyalist.com",
    "tess@theloyalist.com",
  ]);
});

test("a mentioned teammate gets a 'mentioned you' email; watchers get the usual one", () => {
  const mentioned: NotifyEvent = { ...COMMENT, mentions: ["gabby@theloyalist.com"] };
  const mails = buildEmails(mentioned, TEAM, {}, "https://app.example");
  const toGabby = mails.find((m) => m.to === "gabby@theloyalist.com");
  const toTess = mails.find((m) => m.to === "tess@theloyalist.com");
  assert.ok(toGabby && /mentioned you/i.test(toGabby.subject));
  assert.ok(toTess && /New comment/i.test(toTess.subject));
});
