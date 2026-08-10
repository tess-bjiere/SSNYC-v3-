/**
 * A flat comment list, grouped into threads.
 *
 * The comments table is flat: every row carries a parent_id which is either
 * null (a comment) or the id of the comment it answers (a reply). That is the
 * whole data model, and it is deliberately the whole data model — the thing
 * that kills comment threads in a tool like this is not the storage, it is the
 * screen. Three levels of indentation on a 340px drawer leaves about nine
 * characters per line.
 *
 * So: ONE level deep, enforced here rather than in the database. A reply to a
 * reply is re-parented onto the thread root, which is what the person meant
 * anyway — they are answering the conversation, not building a tree. Nothing is
 * lost and nothing is refused; the row keeps its own parent_id, and if a later
 * version of this file wants to nest properly, the data is already there.
 *
 * Two orphan cases are handled, both of which will happen:
 *
 *   - a reply whose parent was deleted (parent_id survives as null via the
 *     ON DELETE SET NULL on the foreign key, so it simply reads as top-level)
 *   - a reply whose parent is not in the list handed to this function, e.g.
 *     because the parent was filtered out by a status filter. It is promoted to
 *     top level rather than dropped. A comment nobody can see is worse than a
 *     comment in slightly the wrong place.
 *
 * A parent_id cycle (only reachable by hand-editing the database) terminates:
 * the root walk is bounded by the number of comments.
 *
 * Dependency-free on purpose: unit-tested directly by node's test runner.
 */

export type CommentLike = {
  id: string;
  parent_id?: string | null;
  created_at?: string | null;
  /**
   * The sample round this comment is about, or null/absent for a comment about
   * the style as a whole. See the scope section at the foot of this file.
   */
  sample_id?: string | null;
};

/**
 * What a reader is currently looking at.
 *
 *   "all"      everything, general and round alike
 *   "general"  only comments about the style as a whole
 *   <uuid>     only comments filed against that sample round
 */
export type CommentScope = "all" | "general" | (string & {});

export type CommentThread<T extends CommentLike> = {
  comment: T;
  replies: T[];
};

function key(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Oldest first, falling back to the position the row arrived in.
 *
 * Oldest-first, not newest-first: a thread read top to bottom is a
 * conversation, and a conversation that runs backwards is unreadable. The list
 * of threads is ordered by the ROOT's date, so a thread does not jump to the
 * top of the drawer because somebody answered it — which is right for a
 * development log and wrong for a chat app. This is a development log.
 */
function byCreated<T extends CommentLike>(rows: readonly T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const ca = key(a.row.created_at);
      const cb = key(b.row.created_at);
      if (ca !== cb) {
        // A row with no timestamp sorts last rather than first — an empty
        // string would otherwise beat every real date.
        if (!ca) return 1;
        if (!cb) return -1;
        return ca < cb ? -1 : 1;
      }
      return a.i - b.i; // stable
    })
    .map((x) => x.row);
}

/**
 * Group a flat list into threads.
 *
 * The input does not have to be sorted. The output is: threads oldest first,
 * replies oldest first within each thread.
 */
export function buildThreads<T extends CommentLike>(rows: readonly T[]): CommentThread<T>[] {
  const all = byCreated(rows);

  const byId = new Map<string, T>();
  for (const row of all) {
    const id = key(row.id);
    if (id) byId.set(id, row);
  }

  /** Walk up to the thread root, bounded so a cycle cannot hang the render. */
  function rootOf(row: T): string {
    let current = row;
    let hops = 0;
    while (hops <= byId.size) {
      const parentId = key(current.parent_id);
      if (!parentId || parentId === key(current.id)) return key(current.id);
      const parent = byId.get(parentId);
      // Parent isn't in this list — the reply floats up rather than vanishing.
      if (!parent) return key(current.id);
      current = parent;
      hops++;
    }
    return key(current.id);
  }

  const threads: CommentThread<T>[] = [];
  const index = new Map<string, CommentThread<T>>();

  // Two passes: roots first, so a reply can never create a thread that the real
  // root then has to be squeezed into.
  for (const row of all) {
    const id = key(row.id);
    if (!id) continue;
    if (rootOf(row) === id) {
      const thread: CommentThread<T> = { comment: row, replies: [] };
      threads.push(thread);
      index.set(id, thread);
    }
  }

  for (const row of all) {
    const id = key(row.id);
    if (!id || index.has(id)) continue;
    const thread = index.get(rootOf(row));
    if (thread) thread.replies.push(row);
  }

  return threads;
}

/** Total comments across all threads — the number the drawer tab shows. */
export function countComments<T extends CommentLike>(threads: readonly CommentThread<T>[]): number {
  let n = 0;
  for (const t of threads) n += 1 + t.replies.length;
  return n;
}

/** "4 comments" / "1 comment" / "No comments" — the drawer heading. */
export function commentCountLabel(n: number): string {
  if (n <= 0) return "No comments";
  return `${n} comment${n === 1 ? "" : "s"}`;
}

/* -----------------------------------------------------------------------------
 * Scope — general, or about one sample round
 *
 * Tess, 2026-08-04: "comments should be linked to specific sample or general
 * profile of style."
 *
 * The point is not filing. It is that "the shoulder is dropping" means a
 * different thing said about the 1st proto than said about the style, and
 * before this the drawer could not tell you which one somebody meant. A round
 * that got three rounds of argument and a round that sailed through looked
 * identical from the profile.
 *
 * Two rules, and the second one is the one that matters:
 *
 *   1. A comment's scope is its sample_id, or "general" when that is null.
 *   2. A REPLY takes its thread root's scope, always — its own sample_id is
 *      ignored. A conversation cannot be half about the 1st proto. Without this
 *      a reply could vanish from the view its question is sitting in, which is
 *      the one thing a threaded drawer must never do.
 *
 * Filtering happens on built threads rather than on raw rows for the same
 * reason: filter the rows first and a reply can outlive its root, or a root can
 * lose the answer to the question it asked.
 * -------------------------------------------------------------------------- */

/** A comment's own scope: its round, or "general". */
export function scopeOf<T extends CommentLike>(row: T): CommentScope {
  const id = key(row.sample_id);
  return id ? id : "general";
}

/**
 * Threads visible under a scope. The root decides; replies come with it.
 *
 * "all" is the identity — the same array back, not a copy, because the caller
 * only reads it and an unnecessary copy on every keystroke of a filter is the
 * sort of thing that makes a drawer feel slow.
 */
export function filterThreads<T extends CommentLike>(
  threads: readonly CommentThread<T>[],
  scope: CommentScope
): CommentThread<T>[] {
  if (scope === "all") return threads as CommentThread<T>[];
  return threads.filter((t) => scopeOf(t.comment) === scope);
}

/** How many comments sit under each scope, replies counted with their root. */
export type ScopeCounts = {
  total: number;
  general: number;
  /** sample_id → count. Rounds with no comments are simply absent. */
  bySample: Map<string, number>;
};

export function scopeCounts<T extends CommentLike>(
  threads: readonly CommentThread<T>[]
): ScopeCounts {
  const bySample = new Map<string, number>();
  let total = 0;
  let general = 0;

  for (const t of threads) {
    const n = 1 + t.replies.length;
    total += n;
    const scope = scopeOf(t.comment);
    if (scope === "general") general += n;
    else bySample.set(scope, (bySample.get(scope) ?? 0) + n);
  }

  return { total, general, bySample };
}

/**
 * The number on a round card's comment button.
 *
 * Zero comes back as 0 rather than being hidden here — whether an empty round
 * shows a quiet "Comment" or nothing at all is a layout decision, and this file
 * does not make layout decisions.
 */
export function countForSample<T extends CommentLike>(
  threads: readonly CommentThread<T>[],
  sampleId: string
): number {
  return scopeCounts(threads).bySample.get(key(sampleId)) ?? 0;
}
