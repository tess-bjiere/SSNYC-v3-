"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { StyleComment } from "@/lib/types";
import {
  filterThreads,
  scopeCounts,
  type CommentScope,
  type CommentThread,
} from "@/lib/commentTree";
import {
  addComment,
  deleteComment,
  editComment,
  markCommentReceived,
  restoreComment,
} from "@/app/actions/styles";
import {
  feedbackCountLabel,
  filterPhotoNotes,
  type PhotoNoteEntry,
} from "@/lib/photoNotes";
import { canDeleteComment, canEditComment } from "@/lib/commentEdit";
import Linked from "@/app/components/Linked";
import { SCOPE_EVENT } from "./commentScope";
import { requestPhotoFocus } from "./photoFocus";

// Comments & feedback, as a right-hand drawer (P3 refinements).
//
// It used to be a section at the very bottom of the profile — below the sample
// rounds, the photography and the versions — which meant that on any style with
// real history you had to scroll past everything to find out what anyone had
// said about it, and then scroll back up to look at the thing they were talking
// about. Feedback belongs beside the work, not after it.
//
// So it is the same drawer as the moodboard notes, deliberately: same pull tab,
// same body.notes-open class that pushes the page across rather than covering
// it, same reply form under each thread. Two tools, one gesture.
//
// Threading is one level deep. lib/commentTree.ts has the reasoning — the short
// version is that 340px of drawer does not have room for a third indent, and a
// reply to a reply is answering the conversation anyway.
//
// SCOPE (Tess, 2026-08-04: "comments should be linked to specific sample or
// general profile of style"). Every comment is either about the style as a
// whole or about one sample round. The chips at the top switch between them,
// and — this is the part that earns the feature — the comment form posts into
// whatever is selected, so filing happens by looking at the right thing rather
// than by remembering to tag it afterwards. Clicking "3 comments" on a round
// card selects that round here and opens the drawer.
//
// ONE FEED, TWO KINDS OF FEEDBACK (Tess, 2026-08-05: "rethink how notes from
// photos are added to the drawer -- it doesn't make logical sense how they show
// up rn"). It didn't, in four specific ways, and all four are fixed here:
//
//   1. The photograph's NAME was printed in the author slot, so a mark on the
//      shoulder seam read as a comment written by somebody called "Lay flat —
//      front". The name is now a subject line — what this is about — which is
//      what it always was.
//   2. The marks were a separate block above the conversation with a heading of
//      their own, so the drawer showed two totals that each claimed to be the
//      total, and a round nobody had typed about announced "No comments" three
//      lines above the note somebody had written on its photograph. There is one
//      count line now and it names both halves. See feedbackCountLabel.
//   3. Where the picture should have been there was a text link reading "View
//      photo". A note about a photograph is unreadable without the photograph;
//      the thumbnail leads the card now and is itself the way back to it.
//   4. The caption and the pins were run together as undifferentiated "notes".
//      They are both things somebody typed — but one is about the whole picture
//      and one is pinned to a spot on it and carries the number drawn there, so
//      they read as what they are.
//
// The one thing that is NOT done, and cannot be honestly: the two kinds are not
// interleaved in time. A comment carries created_at; a mark on a picture carries
// no timestamp and no author at all (lib/imageNotes.ts), so any single
// chronological list would be inventing an order. Marks lead, because they are
// attached to the thing itself, and the conversation follows. If the studio ever
// wants them mixed by date, that needs two columns on the pins — announced, not
// slipped in.
//
// Nothing here is a copy: every entry is derived at render from the same photos
// jsonb the viewer writes. See lib/photoNotes.ts.
//
// EDITING YOUR OWN WORDS (Tess, 2026-08-05: "make my own comments editable").
// The Edit button only appears on comments the signed-in person wrote, and the
// server action checks authorship again for itself — a Server Action is a POST
// endpoint, and a button that was never rendered stops nobody. lib/commentEdit.ts
// holds the rule. Clearing the box does nothing rather than deleting: this app
// stops reading things, it does not remove them.
//
// DELETING YOUR OWN WORDS (Tess, 2026-08-06: "allow for comments to be
// deleted"). Same narrow rule as editing — your own comment, nobody else's,
// no admin override — and the same server-side re-check, because a button that
// was never rendered stops nobody.
//
// It arms rather than asks: NO window.confirm, ever, because a native dialog
// freezes the page and takes the Chrome extension with it. The first click
// turns "Delete" into "Delete?", the second does it, and moving the mouse off
// the card disarms it. Same gesture as Delete on the style itself.
//
// And it is not destruction. One timestamp goes into style_comments.deleted_at;
// the row keeps its author, its words, its scope and its place in the thread.
// It just stops being shown — to everybody, the author included (Tess,
// 2026-08-06: "once i delete i shouldnt still have to see my own cooment").
// The first cut kept it in the column struck through so Restore had somewhere
// to live, and she is right that that is backwards: somebody who has just
// deleted a sentence is telling you they are done looking at it. Undo belongs
// in the moment after the click, so that is where it is — one strip at the top
// of the drawer, for the rest of the visit, and then the comment is simply not
// here any more. Replies are untouched: they are somebody else's words, and
// lib/commentTree.ts already floats a reply whose parent is not in the list up
// to the top rather than dropping it, so an answer outlives the question.
//
// Replies never carry a scope of their own; they inherit the thread root's,
// enforced in the server action AND again in lib/commentTree.ts. A conversation
// cannot be half about the 1st proto.

function when(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts.slice(0, 10);
  }
}

export type RoundOption = { id: string; label: string };

function CommentBody({
  styleId,
  c,
  roundLabel,
  viewerEmail,
  onDeleted,
}: {
  styleId: string;
  c: StyleComment;
  /** Shown only in the "All" view, where a comment's scope is not implied. */
  roundLabel?: string | null;
  /** Who is reading. Only their own comments get an Edit button. */
  viewerEmail?: string | null;
  /** Told after a successful delete, so the drawer can offer Undo. */
  onDeleted?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const received = c.status === "received";
  const mine = canEditComment(c, viewerEmail);
  const deletable = canDeleteComment(c, viewerEmail);

  return (
    <>
      <div className="note-meta">
        <span className="note-by">{c.author || "Someone"}</span>
        <span className="note-when" suppressHydrationWarning>
          {when(c.created_at)}
        </span>
        {roundLabel && <span className="note-scope">{roundLabel}</span>}
        {received && <span className="badge sm">Received</span>}
      </div>

      {editing ? (
        <form
          action={async (fd) => {
            await editComment(styleId, c.id, fd);
            setEditing(false);
          }}
          className="note-edit-form"
        >
          <textarea
            className="textarea"
            name="body"
            defaultValue={c.body ?? ""}
            style={{ minHeight: 64 }}
            autoFocus
          />
          <div className="note-edit-row">
            <button className="btn sm" type="submit">
              Save
            </button>
            <button className="note-act" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {/* Said, because the alternative reading — that emptying the box
              removes the comment — is the one people assume. It now has
              somewhere to point, which it did not before Delete existed. */}
          <div className="note-edit-hint">Clearing the box changes nothing — use Delete.</div>
        </form>
      ) : (
        /* Linked, not raw text: half of what gets pasted into a comment is a
           link to a tech pack or a Drive folder, and until now every one of them
           landed as dead text. */
        <Linked className="note-text" text={c.body} />
      )}

      {!editing && (
        /* Moving the mouse off the row disarms the delete, so an armed button
           can never be left lying under the pointer for the next click. */
        <div className="note-acts" onMouseLeave={() => setArmed(false)}>
          {/* Marking received is a record that somebody acted on it, so it stays
              available on replies too — a factory answer can be the thing that
              needed acknowledging. */}
          {!received && (
            <form action={markCommentReceived.bind(null, styleId, c.id)} className="note-ack">
              <button className="note-act" type="submit">
                Mark received
              </button>
            </form>
          )}
          {mine && (
            <button className="note-act" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {/* Last in the row, and the only one that ever turns red — the order
              of the controls is the order you are likely to want them. */}
          {deletable &&
            (armed ? (
              <button
                type="button"
                className="note-act danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteComment(styleId, c.id);
                    onDeleted?.(c.id);
                  })
                }
              >
                {pending ? "Deleting…" : "Delete?"}
              </button>
            ) : (
              <button
                type="button"
                className="note-act"
                onClick={() => setArmed(true)}
                title="Takes this comment out of the conversation. Nothing is lost — you will still see it here, and Restore puts it back."
              >
                Delete
              </button>
            ))}
        </div>
      )}
    </>
  );
}

/**
 * One photograph and everything written on it.
 *
 * Deliberately the same .note card as a comment — it belongs to the same
 * conversation and reads in the same column — but led by the picture, because
 * a note about a photograph without the photograph is half a sentence.
 */
function PhotoNoteCard({
  entry,
  scopeLabel,
}: {
  entry: PhotoNoteEntry;
  /** The round or "Style", shown only in the All view where it isn't implied. */
  scopeLabel?: string | null;
}) {
  const focus = () => requestPhotoFocus({ sampleId: entry.sampleId, url: entry.url });
  return (
    <div className="note note-photo">
      <div className="note-photo-top">
        {/* The thumbnail IS the link back. It used to be a text link reading
            "View photo" sitting where the picture should have been. */}
        <button
          type="button"
          className="note-photo-thumb"
          title="Open this photograph with the marks on it"
          onClick={focus}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.url} alt="" />
        </button>
        <div className="note-photo-head">
          {/* A subject, not an author. Nobody is called "Lay flat — front". */}
          <div className="note-subject">{entry.label}</div>
          <div className="note-meta">
            <span className="note-when">On the photograph</span>
            {scopeLabel && <span className="note-scope">{scopeLabel}</span>}
          </div>
        </div>
      </div>

      {/* About the whole picture. */}
      {entry.caption && <Linked className="note-text" text={entry.caption} />}

      {/* Pinned to a spot on it, and carrying the number drawn there. */}
      {entry.pins.length > 0 && (
        <div className="note-pins">
          {entry.pins.map((p) => (
            <button
              type="button"
              className="note-pin"
              key={p.n}
              title="Open this photograph with the marks on it"
              onClick={focus}
            >
              <span className="n">{p.n}</span>
              <Linked className="t" text={p.text} />
            </button>
          ))}
        </div>
      )}

      {/* Marks are written on the picture and only mean anything there, so
          there is no edit box here. There used to be an "Open the photograph"
          button under all this as well, which made three controls on one card
          that all did the identical thing — the thumbnail, every pin, and the
          button. The two that are attached to what they open are the ones
          kept. */}
    </div>
  );
}

export default function CommentsDrawer({
  styleId,
  threads,
  total,
  rounds = [],
  photoNotes = [],
  viewerEmail = null,
}: {
  styleId: string;
  threads: CommentThread<StyleComment>[];
  total: number;
  /** Every sample round on this style, in cycle order. */
  rounds?: RoundOption[];
  /**
   * Everything written on the photographs, derived from the same photos jsonb
   * the viewer writes. Not comments, not stored here, not editable here.
   */
  photoNotes?: PhotoNoteEntry[];
  /** The signed-in person, so their own comments can offer an Edit button. */
  viewerEmail?: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [scope, setScope] = useState<CommentScope>("all");
  const [replying, setReplying] = useState<string | null>(null);
  // The comment deleted a moment ago, if any. Deliberately session state and
  // nothing more: it survives until it is undone, dismissed, or the page is
  // reloaded, and it is never read back from the database. A deleted comment
  // is gone from the column the instant it is deleted — this is only the way
  // back for somebody who has just realised they hit the wrong one.
  const [undoable, setUndoable] = useState<string | null>(null);
  const [undoing, startUndo] = useTransition();

  const counts = useMemo(() => scopeCounts(threads), [threads]);
  const shown = useMemo(() => filterThreads(threads, scope), [threads, scope]);
  const shownNotes = useMemo(() => filterPhotoNotes(photoNotes, scope), [photoNotes, scope]);

  const roundName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rounds) m.set(r.id, r.label);
    return m;
  }, [rounds]);

  // Push the page across while the drawer is open rather than covering it —
  // the whole reason for the drawer is being able to see both at once.
  useEffect(() => {
    document.body.classList.toggle("notes-open", open);
    return () => document.body.classList.remove("notes-open");
  }, [open]);

  // A round card asking to be shown. See commentScope.ts for why this is an
  // event and not a prop.
  useEffect(() => {
    function onScope(e: Event) {
      const next = (e as CustomEvent<string>).detail;
      if (!next) return;
      setScope(next);
      setReplying(null);
      setOpen(true);
    }
    window.addEventListener(SCOPE_EVENT, onScope);
    return () => window.removeEventListener(SCOPE_EVENT, onScope);
  }, []);

  // What a new comment will be filed against. "all" is a view, not a
  // destination — posting from it makes a general comment, which is what
  // somebody looking at everything means.
  const postingTo = scope === "all" || scope === "general" ? null : scope;
  const postingLabel = postingTo ? roundName.get(postingTo) ?? "this round" : "the style";

  const shownTotal =
    scope === "all" ? counts.total : scope === "general" ? counts.general : counts.bySample.get(scope) ?? 0;

  const empty = shown.length === 0 && shownNotes.length === 0;

  function chip(value: CommentScope, label: string, n: number) {
    return (
      <button
        key={value}
        type="button"
        className={"note-chip" + (scope === value ? " on" : "")}
        onClick={() => {
          setScope(value);
          setReplying(null);
        }}
      >
        {label}
        {n > 0 && <span className="n">{n}</span>}
      </button>
    );
  }

  return (
    <>
      {!open && (
        <button className="notes-tab" onClick={() => setOpen(true)} title="Show comments">
          ‹ Comments{total ? ` · ${total}` : ""}
        </button>
      )}

      <aside className={"notes-drawer" + (open ? " open" : "")}>
        <div className="notes-drawer-head">
          <span>Comments</span>
          <button className="notes-close" onClick={() => setOpen(false)} title="Hide comments">
            ›
          </button>
        </div>

        <div className="notes-drawer-body">
          {/* Scope. Rounds with no comments still appear — the chip is how you
              find out you can file against a round, and a round nobody has said
              anything about yet is exactly the one worth asking about. */}
          {rounds.length > 0 && (
            <div className="note-chips">
              {chip("all", "All", counts.total)}
              {chip("general", "Style", counts.general)}
              {rounds.map((r) => chip(r.id, r.label, counts.bySample.get(r.id) ?? 0))}
            </div>
          )}

          {undoable && (
            <div className="note-undo">
              <span>Comment deleted.</span>
              <button
                type="button"
                className="note-act"
                disabled={undoing}
                onClick={() =>
                  startUndo(async () => {
                    await restoreComment(styleId, undoable);
                    setUndoable(null);
                  })
                }
              >
                {undoing ? "Undoing…" : "Undo"}
              </button>
              {/* Dismiss, because a strip that can only be cleared by undoing
                  the thing you meant to do is a strip that nags. */}
              <button
                type="button"
                className="note-undo-x"
                title="Dismiss"
                onClick={() => setUndoable(null)}
              >
                ×
              </button>
            </div>
          )}

          {/* ONE count, covering everything below it. It used to repeat the
              scope — "3 comments · 2nd Proto" — directly under the lit chip
              that already said 2nd Proto, which is the kind of small doubling
              that makes a narrow column feel busy. The chip is the label. */}
          <div className="notes-count">{feedbackCountLabel(shownTotal, shownNotes)}</div>

          {/* One feed. Marks lead because they are attached to the garment
              itself; the conversation follows. Not interleaved by date, because
              a mark on a picture has no date — see the header. */}
          {shownNotes.map((e) => (
            <PhotoNoteCard
              key={(e.sampleId ?? "style") + e.url}
              entry={e}
              scopeLabel={
                scope === "all" ? (e.sampleId ? roundName.get(e.sampleId) ?? "Round" : "Style") : null
              }
            />
          ))}

          {shown.map((t) => (
            <div className="note" key={t.comment.id}>
              <CommentBody
                styleId={styleId}
                c={t.comment}
                viewerEmail={viewerEmail}
                onDeleted={setUndoable}
                roundLabel={
                  scope === "all" && t.comment.sample_id
                    ? roundName.get(t.comment.sample_id) ?? "Round"
                    : null
                }
              />

              {t.replies.length > 0 && (
                <div className="note-replies">
                  {t.replies.map((r) => (
                    <div className="note-reply" key={r.id}>
                      <CommentBody
                        styleId={styleId}
                        c={r}
                        viewerEmail={viewerEmail}
                        onDeleted={setUndoable}
                      />
                    </div>
                  ))}
                </div>
              )}

              {replying === t.comment.id ? (
                <form
                  action={async (fd) => {
                    await addComment(styleId, fd);
                    setReplying(null);
                  }}
                  className="note-reply-form"
                >
                  <input type="hidden" name="parent_id" value={t.comment.id} />
                  <input className="input" name="body" placeholder="Reply…" autoComplete="off" autoFocus />
                  <button className="btn ghost sm" type="submit">
                    Reply
                  </button>
                </form>
              ) : (
                /* Tess, 2026-08-05: "make reply smaller and change font to
                   match other fonts on page." It was 10px uppercase with wide
                   tracking — the studio's caption face, used here for something
                   that is not a caption. Under a paragraph of ordinary
                   sentence-case prose it read as a heading for the thread below
                   rather than as a thing to press. It is sentence case now, in
                   the page's own text font, one step down from the comment it
                   answers. See .note-act in globals.css. */
                <button className="note-act" type="button" onClick={() => setReplying(t.comment.id)}>
                  Reply
                </button>
              )}
            </div>
          ))}

          {/* Only when there is genuinely nothing — of either kind. The old
              version had four branches here because it had to explain away a
              heading that had just said "No comments" above a note. */}
          {empty && (
            <div className="notes-empty">
              {scope === "all"
                ? "Nothing yet. Anything written below stays with the style."
                : `Nothing about ${postingLabel} yet.`}
            </div>
          )}
        </div>

        <form action={addComment.bind(null, styleId)} className="note-add">
          {/* The scope goes with the comment. Selecting a round and typing is
              the whole filing gesture — there is no second step to forget. */}
          {postingTo && <input type="hidden" name="sample_id" value={postingTo} />}
          <textarea
            className="textarea"
            name="body"
            placeholder={postingTo ? `Add a comment about ${postingLabel}…` : "Add a comment…"}
            required
            style={{ minHeight: 64 }}
          />
          {/* Just "Post". The placeholder in the box above it already says what
              this is about, and "Post to 2nd Proto" under "Add a comment about
              2nd Proto…" is the same sentence twice in three inches. */}
          <button className="btn sm" type="submit">
            Post
          </button>
        </form>
      </aside>
    </>
  );
}
