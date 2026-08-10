// The rule behind "make my own comments editable".
//
// Two things are being protected here. One: nobody edits somebody else's words
// in a record the studio uses to settle what the factory was told. Two: an
// edit can never be a delete, because this app does not delete.

import test from "node:test";
import assert from "node:assert/strict";

import {
  canDeleteComment,
  canEditComment,
  canRestoreComment,
  isCommentVisibleTo,
  nextCommentBody,
} from "./commentEdit.ts";

test("you can edit your own comment", () => {
  assert.equal(canEditComment({ author: "tess@theloyalist.com" }, "tess@theloyalist.com"), true);
});

test("case and stray spaces are the same person, because Google is inconsistent", () => {
  assert.equal(canEditComment({ author: "Tess@Theloyalist.com" }, "tess@theloyalist.com"), true);
  assert.equal(canEditComment({ author: " tess@theloyalist.com " }, "tess@theloyalist.com"), true);
  assert.equal(canEditComment({ author: "tess@theloyalist.com" }, "  TESS@theloyalist.com "), true);
});

test("you cannot edit somebody else's comment", () => {
  assert.equal(canEditComment({ author: "xander@theloyalist.com" }, "tess@theloyalist.com"), false);
});

test("an unattributed comment belongs to nobody, so nobody may claim it", () => {
  assert.equal(canEditComment({ author: null }, "tess@theloyalist.com"), false);
  assert.equal(canEditComment({ author: "  " }, "tess@theloyalist.com"), false);
  assert.equal(canEditComment({}, "tess@theloyalist.com"), false);
});

test("a signed-out viewer edits nothing", () => {
  assert.equal(canEditComment({ author: "tess@theloyalist.com" }, null), false);
  assert.equal(canEditComment({ author: "tess@theloyalist.com" }, ""), false);
  assert.equal(canEditComment(null, null), false);
});

test("an edit saves the new text", () => {
  assert.equal(nextCommentBody("shorten the sleeve", "shorten the sleeve by 2cm"), "shorten the sleeve by 2cm");
  assert.equal(nextCommentBody("", "first words"), "first words");
});

test("clearing the box is not a delete — it does nothing", () => {
  assert.equal(nextCommentBody("shorten the sleeve", ""), null);
  assert.equal(nextCommentBody("shorten the sleeve", "   "), null);
  assert.equal(nextCommentBody("shorten the sleeve", null), null);
});

test("saving the same words again is not an edit", () => {
  assert.equal(nextCommentBody("shorten the sleeve", "shorten the sleeve"), null);
  assert.equal(nextCommentBody("shorten the sleeve", "  shorten the sleeve  "), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Deleting (Tess, 2026-08-06: "allow for comments to be deleted").
//
// The point of these is that "deleted" here means "withdrawn by the person who
// said it", not "gone". Three things have to hold: only the author can do it,
// it is reversible by that same person, and everybody else stops seeing it
// while the row itself stays in the table.

const TESS = "tess@theloyalist.com";
const XAN = "xander@theloyalist.com";
const LORNY = "lorny@theloyalist.com";
const PREVIEW = "preview@theloyalist.com";
const GONE = "2026-08-06T10:00:00.000Z";

test("anybody can delete their own comment", () => {
  assert.equal(canDeleteComment({ author: XAN }, XAN), true);
  assert.equal(canDeleteComment({ author: "Xander@Theloyalist.com" }, XAN), true);
});

test("an ordinary signed-in person cannot delete somebody else's", () => {
  assert.equal(canDeleteComment({ author: TESS }, XAN), false);
  assert.equal(canDeleteComment({ author: LORNY }, XAN), false);
});

test("the two moderators can delete anybody's comment", () => {
  // Tess, 2026-08-06: "preview@theloyalist.com and tess@theloyalist.com should
  // be able to delete any comments".
  assert.equal(canDeleteComment({ author: XAN }, TESS), true);
  assert.equal(canDeleteComment({ author: XAN }, PREVIEW), true);
  assert.equal(canDeleteComment({ author: LORNY }, "Preview@Theloyalist.com"), true);
  // And can put it back, which is what makes the power safe to hand over.
  assert.equal(canRestoreComment({ author: XAN, deleted_at: GONE }, TESS), true);
  assert.equal(canRestoreComment({ author: XAN, deleted_at: GONE }, PREVIEW), true);
});

test("a moderator still cannot rewrite somebody else's words", () => {
  // The override reaches delete and restore and stops there. Withdrawing a
  // comment leaves it intact; editing it would put words in somebody's mouth.
  assert.equal(canEditComment({ author: XAN }, TESS), false);
  assert.equal(canEditComment({ author: XAN }, PREVIEW), false);
});

test("a moderator can clear a comment nobody signed; an ordinary person cannot", () => {
  assert.equal(canDeleteComment({ author: null }, TESS), true);
  assert.equal(canDeleteComment({}, PREVIEW), true);
  assert.equal(canDeleteComment({ author: null }, XAN), false);
  assert.equal(canDeleteComment({}, XAN), false);
});

test("signed out deletes nothing, and neither does a missing comment", () => {
  assert.equal(canDeleteComment({ author: TESS }, null), false);
  assert.equal(canDeleteComment(null, TESS), false);
  assert.equal(canDeleteComment({ author: XAN }, ""), false);
});

test("deleting twice is a no-op, not a second timestamp", () => {
  assert.equal(canDeleteComment({ author: TESS, deleted_at: GONE }, TESS), false);
});

test("a deleted comment is not editable — restore it first", () => {
  assert.equal(canEditComment({ author: TESS, deleted_at: GONE }, TESS), false);
  assert.equal(canEditComment({ author: TESS, deleted_at: null }, TESS), true);
});

test("the author or a moderator puts it back, and only if it is actually deleted", () => {
  assert.equal(canRestoreComment({ author: TESS, deleted_at: GONE }, TESS), true);
  assert.equal(canRestoreComment({ author: XAN, deleted_at: GONE }, LORNY), false);
  assert.equal(canRestoreComment({ author: TESS, deleted_at: null }, TESS), false);
  assert.equal(canRestoreComment({ author: TESS }, TESS), false);
});

test("a live comment is visible, deleted is visible to nobody", () => {
  // Tess, 2026-08-06: "once i delete i shouldnt still have to see my own
  // cooment." The author is not an exception — Undo lives in the moment after
  // the click, not permanently in the column.
  assert.equal(isCommentVisibleTo({ author: XAN }, TESS), true);
  assert.equal(isCommentVisibleTo({ author: XAN, deleted_at: null }, null), true);
  assert.equal(isCommentVisibleTo({ author: TESS, deleted_at: GONE }, TESS), false);
  assert.equal(isCommentVisibleTo({ author: XAN, deleted_at: GONE }, TESS), false);
  assert.equal(isCommentVisibleTo(null, TESS), false);
});
