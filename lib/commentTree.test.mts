import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildThreads,
  countComments,
  commentCountLabel,
  scopeOf,
  filterThreads,
  scopeCounts,
  countForSample,
} from "./commentTree.ts";

type Row = { id: string; parent_id?: string | null; created_at?: string | null; body?: string };

const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

test("a flat list with no parents is all roots, oldest first", () => {
  const threads = buildThreads<Row>([
    { id: "b", created_at: "2026-03-02" },
    { id: "a", created_at: "2026-03-01" },
    { id: "c", created_at: "2026-03-03" },
  ]);
  assert.deepEqual(threads.map((t) => t.comment.id), ["a", "b", "c"]);
  assert.deepEqual(threads.map((t) => t.replies.length), [0, 0, 0]);
});

test("replies attach to their comment, oldest first inside the thread", () => {
  const threads = buildThreads<Row>([
    { id: "r2", parent_id: "a", created_at: "2026-03-05" },
    { id: "a", created_at: "2026-03-01" },
    { id: "r1", parent_id: "a", created_at: "2026-03-02" },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].comment.id, "a");
  assert.deepEqual(ids(threads[0].replies), ["r1", "r2"]);
});

test("a reply to a reply is flattened onto the thread root, not nested", () => {
  // One level deep is the whole point: three levels of indentation on a 340px
  // drawer is unreadable, and answering a reply means answering the thread.
  const threads = buildThreads<Row>([
    { id: "a", created_at: "2026-03-01" },
    { id: "b", parent_id: "a", created_at: "2026-03-02" },
    { id: "c", parent_id: "b", created_at: "2026-03-03" },
    { id: "d", parent_id: "c", created_at: "2026-03-04" },
  ]);
  assert.equal(threads.length, 1);
  assert.deepEqual(ids(threads[0].replies), ["b", "c", "d"]);
});

test("a reply whose parent is not in the list floats up rather than vanishing", () => {
  // Happens the moment anything filters the list. A comment nobody can see is
  // worse than a comment in slightly the wrong place.
  const threads = buildThreads<Row>([
    { id: "a", created_at: "2026-03-01" },
    { id: "orphan", parent_id: "deleted-or-filtered", created_at: "2026-03-02" },
  ]);
  assert.deepEqual(threads.map((t) => t.comment.id), ["a", "orphan"]);
  assert.equal(countComments(threads), 2);
});

test("a null parent_id is simply a top-level comment", () => {
  const threads = buildThreads<Row>([
    { id: "a", parent_id: null, created_at: "2026-03-01" },
    { id: "b", parent_id: "  ", created_at: "2026-03-02" },
  ]);
  assert.equal(threads.length, 2);
});

test("a comment that claims to be its own parent is treated as a root", () => {
  const threads = buildThreads<Row>([{ id: "a", parent_id: "a", created_at: "2026-03-01" }]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].comment.id, "a");
});

test("a parent_id cycle terminates instead of hanging the render", () => {
  // Only reachable by hand-editing the database, but the walk is bounded so a
  // bad row cannot take the page down with it.
  const threads = buildThreads<Row>([
    { id: "a", parent_id: "b", created_at: "2026-03-01" },
    { id: "b", parent_id: "a", created_at: "2026-03-02" },
  ]);
  assert.ok(Array.isArray(threads));
  assert.ok(countComments(threads) <= 2);
});

test("threads are ordered by the comment's date, not by its newest reply", () => {
  // A development log, not a chat app: answering an old thread should not drag
  // it to the top and reshuffle everything under somebody's cursor.
  const threads = buildThreads<Row>([
    { id: "old", created_at: "2026-01-01" },
    { id: "new", created_at: "2026-03-01" },
    { id: "r", parent_id: "old", created_at: "2026-04-01" },
  ]);
  assert.deepEqual(threads.map((t) => t.comment.id), ["old", "new"]);
  assert.deepEqual(ids(threads[0].replies), ["r"]);
});

test("a row with no timestamp sorts last rather than first", () => {
  const threads = buildThreads<Row>([
    { id: "undated", created_at: null },
    { id: "dated", created_at: "2026-03-01" },
  ]);
  assert.deepEqual(threads.map((t) => t.comment.id), ["dated", "undated"]);
});

test("equal timestamps keep the order they arrived in", () => {
  const threads = buildThreads<Row>([
    { id: "first", created_at: "2026-03-01T10:00:00Z" },
    { id: "second", created_at: "2026-03-01T10:00:00Z" },
    { id: "third", created_at: "2026-03-01T10:00:00Z" },
  ]);
  assert.deepEqual(threads.map((t) => t.comment.id), ["first", "second", "third"]);
});

test("a row with no id is skipped rather than creating a keyless thread", () => {
  const threads = buildThreads<Row>([
    { id: "", created_at: "2026-03-01" },
    { id: "a", created_at: "2026-03-02" },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].comment.id, "a");
});

test("the whole row comes through, not just the id — the drawer renders it", () => {
  const threads = buildThreads<Row>([
    { id: "a", created_at: "2026-03-01", body: "Neckline up 1cm." },
    { id: "b", parent_id: "a", created_at: "2026-03-02", body: "Flagged to the factory." },
  ]);
  assert.equal(threads[0].comment.body, "Neckline up 1cm.");
  assert.equal(threads[0].replies[0].body, "Flagged to the factory.");
});

test("the count is every comment and every reply", () => {
  const threads = buildThreads<Row>([
    { id: "a", created_at: "2026-03-01" },
    { id: "b", parent_id: "a", created_at: "2026-03-02" },
    { id: "c", parent_id: "a", created_at: "2026-03-03" },
    { id: "d", created_at: "2026-03-04" },
  ]);
  assert.equal(threads.length, 2);
  assert.equal(countComments(threads), 4);
  assert.equal(countComments([]), 0);
});

test("the drawer heading reads as English", () => {
  assert.equal(commentCountLabel(0), "No comments");
  assert.equal(commentCountLabel(-3), "No comments");
  assert.equal(commentCountLabel(1), "1 comment");
  assert.equal(commentCountLabel(2), "2 comments");
});

/* --- scope: general vs a specific sample round ---------------------------- */

type SRow = Row & { sample_id?: string | null };

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";

// One fixture used by most of the scope tests: two general threads, one thread
// on round 1 with a reply, one thread on round 2.
function scoped(): SRow[] {
  return [
    { id: "g1", created_at: "2026-03-01" },
    { id: "s1a", sample_id: S1, created_at: "2026-03-02" },
    { id: "s1a-r", parent_id: "s1a", sample_id: S1, created_at: "2026-03-03" },
    { id: "g2", created_at: "2026-03-04" },
    { id: "s2a", sample_id: S2, created_at: "2026-03-05" },
  ];
}

test("scopeOf reads the round, and treats a missing round as general", () => {
  assert.equal(scopeOf<SRow>({ id: "x", sample_id: S1 }), S1);
  assert.equal(scopeOf<SRow>({ id: "x", sample_id: null }), "general");
  assert.equal(scopeOf<SRow>({ id: "x" }), "general");
  // Whitespace is not a round.
  assert.equal(scopeOf<SRow>({ id: "x", sample_id: "   " }), "general");
});

test("filtering to 'all' returns every thread", () => {
  const threads = buildThreads<SRow>(scoped());
  assert.equal(filterThreads(threads, "all").length, threads.length);
});

test("filtering to 'general' returns only style-wide threads", () => {
  const threads = buildThreads<SRow>(scoped());
  assert.deepEqual(
    filterThreads(threads, "general").map((t) => t.comment.id),
    ["g1", "g2"]
  );
});

test("filtering to a round returns only that round's threads", () => {
  const threads = buildThreads<SRow>(scoped());
  assert.deepEqual(filterThreads(threads, S1).map((t) => t.comment.id), ["s1a"]);
  assert.deepEqual(filterThreads(threads, S2).map((t) => t.comment.id), ["s2a"]);
});

test("a round with no comments filters to nothing rather than erroring", () => {
  const threads = buildThreads<SRow>(scoped());
  assert.deepEqual(filterThreads(threads, "33333333-3333-3333-3333-333333333333"), []);
});

test("a reply keeps its root's scope even when its own is different", () => {
  // The rule that matters: a conversation is never half about one round. A
  // reply that somehow carried the wrong sample_id must not fall out of the
  // view its question is sitting in.
  const threads = buildThreads<SRow>([
    { id: "root", sample_id: S1, created_at: "2026-03-01" },
    { id: "reply", parent_id: "root", sample_id: S2, created_at: "2026-03-02" },
  ]);
  const onOne = filterThreads(threads, S1);
  assert.equal(onOne.length, 1);
  assert.deepEqual(ids(onOne[0].replies), ["reply"]);
  // ...and it does not also show up under the round it wrongly claimed.
  assert.deepEqual(filterThreads(threads, S2), []);
});

test("a general reply under a round root stays with the round", () => {
  const threads = buildThreads<SRow>([
    { id: "root", sample_id: S1, created_at: "2026-03-01" },
    { id: "reply", parent_id: "root", created_at: "2026-03-02" },
  ]);
  assert.equal(filterThreads(threads, S1)[0].replies.length, 1);
  assert.deepEqual(filterThreads(threads, "general"), []);
});

test("scopeCounts counts replies with their root", () => {
  const c = scopeCounts(buildThreads<SRow>(scoped()));
  assert.equal(c.total, 5);
  assert.equal(c.general, 2);
  assert.equal(c.bySample.get(S1), 2); // root + reply
  assert.equal(c.bySample.get(S2), 1);
});

test("scopeCounts total always equals countComments", () => {
  const threads = buildThreads<SRow>(scoped());
  assert.equal(scopeCounts(threads).total, countComments(threads));
});

test("a round with no comments is absent from bySample, not zero", () => {
  const c = scopeCounts(buildThreads<SRow>(scoped()));
  assert.equal(c.bySample.has("33333333-3333-3333-3333-333333333333"), false);
});

test("countForSample is the number on a round card", () => {
  const threads = buildThreads<SRow>(scoped());
  assert.equal(countForSample(threads, S1), 2);
  assert.equal(countForSample(threads, S2), 1);
  assert.equal(countForSample(threads, "nope"), 0);
});

test("scope never loses a comment: every thread lands in exactly one bucket", () => {
  const threads = buildThreads<SRow>(scoped());
  const buckets = ["general", S1, S2] as const;
  const seen = buckets.flatMap((b) => filterThreads(threads, b).map((t) => t.comment.id));
  assert.equal(seen.length, threads.length);
  assert.equal(new Set(seen).size, threads.length);
});

test("comments written before scoping existed all read as general", () => {
  // Every row already in the database has sample_id null. Nothing moves.
  const legacy: SRow[] = [
    { id: "a", created_at: "2026-01-01" },
    { id: "b", parent_id: "a", created_at: "2026-01-02" },
  ];
  const threads = buildThreads<SRow>(legacy);
  assert.equal(filterThreads(threads, "general").length, 1);
  assert.equal(scopeCounts(threads).general, 2);
});
