// The in-app activity feed (Tess, 2026-08-26: "is there a way to send
// notifications to team without ... TL dns" → an in-app bell instead of relying
// on email). A person sees new comments on the styles they watch — the ones they
// created or have themselves commented on — the same "watcher" rule the email
// notifications use, so the two agree on who cares. You are never shown your own
// comment. Pure and node-testable; the database reads live in the page.

export type ActivityComment = {
  id: string;
  styleId: string;
  author: string | null;
  body: string;
  createdAt: string; // ISO 8601
};

export type ActivityItem = {
  commentId: string;
  styleId: string;
  styleName: string;
  author: string | null;
  excerpt: string;
  createdAt: string;
  /** New since this viewer last opened the feed. */
  unread: boolean;
};

function norm(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

/** A short, single-line preview of a comment body. */
export function commentExcerpt(body: string, max = 140): string {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/** The styles this person watches: ones they created, plus ones they have
 *  commented on. Ids only; order not significant. Mirrors watchersOf in
 *  lib/notify so the bell and the email cover the same styles. */
export function watchedStyleIds(input: {
  me: string | null;
  createdStyleIds: string[];
  commentedStyleIds: string[];
}): Set<string> {
  if (!norm(input.me)) return new Set();
  return new Set([...input.createdStyleIds, ...input.commentedStyleIds].filter(Boolean));
}

/**
 * Build the feed from resolved rows. `comments` are recent comments on the
 * watched styles; `styleNames` maps style id → name (a comment whose style is not
 * in the map is dropped — deleted or out of scope). `me` is excluded as an author.
 * `lastSeen` (ISO or null) is the cut for the unread flag. Newest first, capped.
 */
export function buildActivity(input: {
  me: string | null;
  comments: ActivityComment[];
  styleNames: Map<string, string>;
  lastSeen: string | null;
  limit?: number;
}): { items: ActivityItem[]; unread: number } {
  const me = norm(input.me);
  const seen = input.lastSeen ? Date.parse(input.lastSeen) : 0;
  const items = input.comments
    .filter((c) => norm(c.author) !== me)
    .filter((c) => input.styleNames.has(c.styleId))
    .map((c): ActivityItem => {
      const t = Date.parse(c.createdAt);
      return {
        commentId: c.id,
        styleId: c.styleId,
        styleName: input.styleNames.get(c.styleId) || "a style",
        author: c.author,
        excerpt: commentExcerpt(c.body),
        createdAt: c.createdAt,
        unread: Number.isFinite(t) && Number.isFinite(seen) ? t > seen : false,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, input.limit ?? 50);
  return { items, unread: items.filter((i) => i.unread).length };
}

/** How many of the given comments are unread by this viewer — the nav badge
 *  number, computed without building the whole feed. `styleIds` is the watched
 *  set; a comment on an unwatched style, by this viewer, or at/-before lastSeen
 *  does not count. */
export function unreadCount(input: {
  me: string | null;
  comments: ActivityComment[];
  watched: Set<string>;
  lastSeen: string | null;
}): number {
  const me = norm(input.me);
  const seen = input.lastSeen ? Date.parse(input.lastSeen) : 0;
  return input.comments.filter((c) => {
    if (norm(c.author) === me) return false;
    if (!input.watched.has(c.styleId)) return false;
    const t = Date.parse(c.createdAt);
    return Number.isFinite(t) && t > seen;
  }).length;
}
