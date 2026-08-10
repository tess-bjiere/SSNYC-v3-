// Who is allowed to change a comment after it is posted.
//
// Tess, 2026-08-05: "make my own comments editable."
//
// The word doing the work in that sentence is "my". A comment thread is the
// record of what the factory was told and when, and the studio reads it back
// weeks later to settle exactly that question. So EDITING is narrow on purpose
// and stays that way: you may rewrite your own words, and nobody else's, with
// no override for anybody. Deleting is different — it withdraws a comment
// without altering it, so two named moderators may do it to any comment, and
// may put it back. See MODERATORS below.
//
// Dependency-free so it can be unit tested on its own, like every other rule
// module in lib/. The comparison is deliberately not `a === b`: Google hands
// back an address in whatever case the person typed it into the browser, and
// "Tess@Theloyalist.com" is the same human being as "tess@theloyalist.com".

/** The bit of a comment row this rule needs. */
export type EditableCommentLike = {
  author?: string | null;
  /** ISO timestamp. Only used by the label helper, never by the permission. */
  created_at?: string | null;
  /**
   * When the author took this comment out of the conversation, or null/absent
   * for a live one. Added 2026-08-06 — see the style_comments_deleted_at
   * migration. Optional on purpose: every caller that predates it passes a row
   * without the field, and "absent" has to keep meaning "live".
   */
  deleted_at?: string | null;
};

/** Lowercased, trimmed, empty string for nothing. Same shape as lib/authz.ts. */
function norm(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * May `viewer` edit a comment written by `author`?
 *
 * False for an unsigned-in viewer and false for a comment with no author
 * recorded. An unattributed comment is one nobody can prove they wrote, and
 * letting the next person along claim it would be worse than leaving it alone.
 */
export function canEditComment(
  comment: EditableCommentLike | null | undefined,
  viewerEmail: string | null | undefined
): boolean {
  // A deleted comment is not editable. Restore it and then rewrite it — two
  // deliberate acts, and the record of what was said stays honest in between.
  if (comment?.deleted_at) return false;
  return isAuthor(comment, viewerEmail);
}

/**
 * The two people who may take down anybody's comment.
 *
 * Tess, 2026-08-06: "preview@theloyalist.com and tess@theloyalist.com should be
 * able to delete any comments".
 *
 * A moderator is not a co-author, so this reaches DELETE and RESTORE and
 * deliberately stops there. Editing stays author-only, permanently: deleting
 * somebody else's comment withdraws it and leaves the row intact with its
 * original words and its original name on it, but rewriting it would put words
 * in their mouth — and the whole reason this thread is worth keeping is that it
 * settles what the factory was actually told and by whom.
 *
 * Lower-cased here because they are compared against a normalised address.
 * Hard-coded rather than a database column on purpose: it is two addresses, one
 * of which is the owner's, and a permissions table is a thing to administer.
 * When it needs to be three, it is one line — and if it ever needs to be a
 * role, `app_allowlist` is where that belongs.
 */
const MODERATORS = ["tess@theloyalist.com", "preview@theloyalist.com"];

/** True when `viewer` is one of the two people who may moderate any comment. */
function isModerator(viewerEmail: string | null | undefined): boolean {
  const viewer = norm(viewerEmail);
  return !!viewer && MODERATORS.includes(viewer);
}

/** True when `viewer` is the person who wrote `comment`. The whole rule. */
function isAuthor(
  comment: EditableCommentLike | null | undefined,
  viewerEmail: string | null | undefined
): boolean {
  const author = norm(comment?.author);
  const viewer = norm(viewerEmail);
  if (!author || !viewer) return false;
  return author === viewer;
}

/**
 * May `viewer` delete this comment?
 *
 * Tess, 2026-08-06: "allow for comments to be deleted."
 *
 * Your own words, always. Plus the two moderators, who may take down anybody's
 * (Tess, 2026-08-06: "preview@theloyalist.com and tess@theloyalist.com should
 * be able to delete any comments") — this replaces the earlier "no admin
 * override" note above, which held while nobody had asked for one.
 *
 * The override is safe to give because delete here is not destruction. It sets
 * one timestamp; the row keeps its author, its words and its place in the
 * thread, restore is the same timestamp back to null, and a moderator can
 * restore anything a moderator can delete. Nothing a moderator does is
 * one-way.
 *
 * Already-deleted is false, so a double submit is a no-op rather than a second
 * timestamp overwriting the first.
 */
export function canDeleteComment(
  comment: EditableCommentLike | null | undefined,
  viewerEmail: string | null | undefined
): boolean {
  // No comment at all is nothing to delete, moderator or not. Without this the
  // override would answer "yes" to a row that was never found.
  if (!comment) return false;
  if (comment.deleted_at) return false;
  // An unattributed comment has no author to be, so before this it could be
  // deleted by nobody at all and sat in the thread permanently. A moderator can
  // now clear it — which is most of what a moderator is for.
  return isAuthor(comment, viewerEmail) || isModerator(viewerEmail);
}

/**
 * May `viewer` put this comment back?
 *
 * The exact mirror of canDeleteComment — the author or a moderator, and only if
 * it is actually deleted. Mirrored on purpose: a rule where somebody can take a
 * comment down but not put it back is a rule that turns a misclick into a
 * permanent loss, which is the one thing this design is built to avoid.
 */
export function canRestoreComment(
  comment: EditableCommentLike | null | undefined,
  viewerEmail: string | null | undefined
): boolean {
  if (!comment?.deleted_at) return false;
  return isAuthor(comment, viewerEmail) || isModerator(viewerEmail);
}

/**
 * Should this comment be shown at all?
 *
 * Tess, 2026-08-06: "once i delete i shouldnt still have to see my own
 * cooment."
 *
 * The first cut of this feature kept a withdrawn comment on screen for its own
 * author, struck through, so that Restore had somewhere to live. She is right
 * that that is wrong: a person who has just deleted something is telling you
 * they are finished looking at it, and leaving it in the column makes the
 * drawer longer every time somebody tidies up. Undo belongs in the moment
 * after the click, not permanently in the record.
 *
 * So this is now the simple thing it looks like: deleted is not shown, to
 * anybody. The row is still in the table with its author and its words — the
 * standing rule is that things stop being read, they do not disappear — and
 * restoreComment still exists and is still authorship-gated, reachable from
 * the Undo that appears for the rest of the visit.
 */
export function isCommentVisibleTo(
  comment: EditableCommentLike | null | undefined,
  _viewerEmail?: string | null
): boolean {
  if (!comment) return false;
  return !comment.deleted_at;
}

/**
 * The body after an edit, or null if the edit should not be saved.
 *
 * Blank is not an edit, and it is not the way to delete either — Delete is its
 * own control now, with its own two-click arm and its own Undo. A cleared box
 * therefore does nothing at all rather than quietly emptying the record of what
 * the factory was told, which is the reading people assume and the one that
 * would lose words by accident. Text identical to what is already there is also
 * nothing, so a stray save does not churn the row.
 */
export function nextCommentBody(
  current: string | null | undefined,
  submitted: string | null | undefined
): string | null {
  const next = typeof submitted === "string" ? submitted.trim() : "";
  if (!next) return null;
  const now = typeof current === "string" ? current.trim() : "";
  if (next === now) return null;
  return next;
}
