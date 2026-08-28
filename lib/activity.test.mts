import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildActivity,
  unreadCount,
  watchedStyleIds,
  commentExcerpt,
  type ActivityComment,
} from "./activity.ts";

const c = (id: string, styleId: string, author: string, createdAt: string, body = "hi"): ActivityComment => ({
  id,
  styleId,
  author,
  body,
  createdAt,
});

// The feed drops your own comments and any comment whose style you don't watch
// (not in styleNames), and flags as unread only what arrived after you last looked.
test("buildActivity excludes self, keeps watched, flags unread by lastSeen", () => {
  const names = new Map([
    ["s1", "Rib Tank"],
    ["s2", "Wide Trouser"],
  ]);
  const comments = [
    c("a", "s1", "kara@x.com", "2026-08-26T10:00:00Z"), // unread (after seen)
    c("b", "s1", "me@x.com", "2026-08-26T11:00:00Z"), // mine — dropped
    c("c", "s2", "kara@x.com", "2026-08-20T10:00:00Z"), // read (before seen)
    c("d", "s3", "kara@x.com", "2026-08-26T12:00:00Z"), // unwatched style — dropped
  ];
  const { items, unread } = buildActivity({
    me: "me@x.com",
    comments,
    styleNames: names,
    lastSeen: "2026-08-25T00:00:00Z",
  });
  assert.deepEqual(items.map((i) => i.commentId), ["a", "c"]); // newest first, self/unwatched gone
  assert.equal(items[0].unread, true);
  assert.equal(items[1].unread, false);
  assert.equal(unread, 1);
});

// A null lastSeen (never opened the feed) makes everything from others unread.
test("buildActivity treats never-seen as all unread", () => {
  const { unread } = buildActivity({
    me: "me@x.com",
    comments: [c("a", "s1", "kara@x.com", "2026-01-01T00:00:00Z")],
    styleNames: new Map([["s1", "X"]]),
    lastSeen: null,
  });
  assert.equal(unread, 1);
});

test("unreadCount counts only others' comments on watched styles after lastSeen", () => {
  const watched = watchedStyleIds({
    me: "me@x.com",
    createdStyleIds: ["s1"],
    commentedStyleIds: ["s2"],
  });
  const n = unreadCount({
    me: "me@x.com",
    watched,
    lastSeen: "2026-08-25T00:00:00Z",
    comments: [
      c("a", "s1", "kara@x.com", "2026-08-26T00:00:00Z"), // counts
      c("b", "s2", "kara@x.com", "2026-08-26T00:00:00Z"), // counts (commented style)
      c("c", "s1", "me@x.com", "2026-08-26T00:00:00Z"), // mine — no
      c("d", "s9", "kara@x.com", "2026-08-26T00:00:00Z"), // unwatched — no
      c("e", "s1", "kara@x.com", "2026-08-01T00:00:00Z"), // before seen — no
    ],
  });
  assert.equal(n, 2);
});

test("commentExcerpt collapses whitespace and truncates", () => {
  assert.equal(commentExcerpt("  hello   world \n next "), "hello world next");
  assert.equal(commentExcerpt("abcdefghij", 5), "abcd…");
});
