"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import type { ImageNote } from "@/lib/imageNotes";
import {
  saveImagePin,
  removeImagePin,
  setImageCaption,
  addImagePinReply,
  removeImagePinReply,
} from "@/app/actions/styles";
import Linked from "@/app/components/Linked";

// A reply's date, short and forgiving of a bad string — the same face the
// comments drawer uses so a fit-comment thread and a style comment read alike.
function when(ts: string): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts.slice(0, 10);
  }
}

// Writing on a photograph.
//
// Tess, 2026-08-05: "you should be able to add text comments to each image as
// well as notate on the images."
//
// The studio already does this. Somebody prints the proto shots, takes a red
// pen to the shoulder seam, writes "1cm too wide" beside it and photographs the
// paper. This is that act, kept with the photograph instead of beside it — and
// the reason it is worth building rather than leaving to the fit notes is that
// "shoulder seam too wide" in a paragraph is a sentence the factory has to map
// back onto a garment, while the same words hanging off a mark on the shoulder
// are an instruction.
//
// Click the picture, a numbered mark lands where you clicked and asks what is
// wrong. Click a mark to re-read or rewrite it. The caption underneath is the
// other half of what Tess asked for and a different thing entirely: it says
// what the picture IS — "PPS, before the collar was corrected" — which is the
// note that stops a photograph becoming unidentifiable six weeks later.
//
// WHY THE PICTURE GETS BIGGER. Marking a seam on a card two hundred pixels wide
// is guesswork. Opening the notes lifts the photograph to a full-width row
// underneath its own card — grid-column 1 / -1, so it appears in place rather
// than as a modal — and the marks are placed against that. Positions are stored
// as fractions of the image, never pixels, so a mark dropped here lands on the
// same seam on a phone.
//
// NOT A MODAL. Nothing in this app opens a browser dialog and nothing traps the
// page: the block is a row in the grid, "Done" shuts it, and the page behind it
// stays scrollable and readable. Removing a mark is the same two-click arm the
// rest of the tool uses — "Remove" then "Remove?" — and moving the pointer away
// disarms it.
//
// CLICKING THE PICTURE OPENS THIS (Tess, 2026-08-05: "when you click into photo
// you should be able to see comments / text / mark-ups. you should be able to
// navigate to next or previous photo"). It used to open the raw file in a new
// browser tab, which was the one place in the tool where a click led out of the
// tool — the caption was left behind, the marks were left behind, and getting
// back meant closing a tab. Now the picture is a button and this is what it
// opens; the raw file is still one click away, from "Original file" in the
// header, for the times somebody wants to download or forward it.
//
// FULL SIZE IS FULL SIZE OF THIS (Tess, 2026-08-05: "comments and markups
// should be available on full size"). "Full size" used to be that same link out
// to the raw file — the one view of a photograph in this tool that carried none
// of what had been written about it. It now fills the window with this
// component instead: the picture as large as it fits, its marks on it, its
// notes beside it, the arrows still in the header, and the same click-to-mark
// behaviour. Fixed to the viewport, not a browser dialog — Escape and Done both
// step back out of it, and the page underneath is exactly where it was.
//
// AND YOU CAN WALK THROUGH THEM. Arrows in the header, or the left and right
// keys, move to the next photograph in whatever list this one came from — the
// round's five slots, the gallery, a round's extra shots. Reviewing a proto is
// looking at six photographs in a row, and having to shut each one to reach the
// next made that six deliberate acts instead of one pass. Escape shuts it, or
// clears a mark you were part-way through writing. The keys are ignored while
// the caret is in a text box, so typing "left" into a note never navigates.
//
// Every write goes through lib/imageNotes.ts, which carries every other key in
// the photos map through untouched. The slots, the gallery, the round's shots
// and every other image's notes all share this one jsonb object, and none of
// them can delete another.

type Draft = { id: string | null; x: number; y: number; text: string };

export default function ImageNotes({
  styleId,
  sampleId = null,
  url,
  label,
  note,
  onClose,
  onPrev = null,
  onNext = null,
  position,
  full = false,
  onFull,
  caption = true,
  openPinId = null,
  onOpenedPin,
  meta,
}: {
  styleId: string;
  /** Null when the picture hangs off the style rather than off a round. */
  sampleId?: string | null;
  url: string;
  label: string;
  note: ImageNote;
  /**
   * What this picture is OF — shown as a context line in the full-screen view so
   * you know the style, its number, the factory and (on a round) the fit date
   * without leaving the enlarged image (Tess, 2026-08-24: "Add more details to
   * full screen view — show title, style number, factory fit date etc"). All
   * optional; a blank part is dropped.
   */
  meta?: { name?: string | null; styleNo?: string | null; factory?: string | null; fitDate?: string | null };
  onClose: () => void;
  /**
   * Move to the neighbouring picture in the list this one belongs to, or null
   * at the ends. The caller owns the list and simply points this component at a
   * different image — everything here is derived from the props, so the marks,
   * the caption and any half-written draft belong to the picture on screen.
   */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  /** "2 of 6" — where in that list this picture is. */
  position?: string;
  /**
   * Filling the window, marks and all.
   *
   * Owned by the caller for the same reason the navigation is: moving to the
   * next picture unmounts this component and mounts another one, so a full-size
   * flag kept in here would drop you back into the grid on every arrow press —
   * which would make walking a set full size impossible, and walking a set full
   * size is most of the point of it.
   */
  full?: boolean;
  onFull?: (full: boolean) => void;
  /**
   * False where the picture already carries a caption of its own.
   *
   * The gallery and the round's shots are ordered lists, and a list entry has
   * always had a caption stored on the entry itself. Showing a second caption
   * box here would be two fields for one sentence, and whichever one the person
   * did not use would sit empty under the picture looking like a mistake. The
   * fixed slots have no such field, so there the caption belongs here.
   */
  caption?: boolean;
  /**
   * Open the viewer straight onto one mark's editor — its text and its reply
   * thread — instead of the fit-comment list (Tess, 2026-08-17: "you should be
   * able to reply to fit comments in full screen view as well"). The FullRound
   * rail passes this so a fit comment in the review is one click from its
   * replies. Null opens on the list, the way every other caller does.
   */
  openPinId?: string | null;
  /** Told once openPinId has been applied, so the caller can clear it and the
   *  same mark can be re-opened after the editor is closed. */
  onOpenedPin?: () => void;
}) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState("");
  // The reply being written under the open mark, and the two-click arm for
  // removing one of its existing replies.
  const [reply, setReply] = useState("");
  const [armedReply, setArmedReply] = useState<string | null>(null);
  // Set when a mark was opened by a "Reply" button rather than to edit it, so
  // the caret lands in the reply box instead of the mark's own text.
  const [wantReplyFocus, setWantReplyFocus] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  const busy = pending;

  // The live pin behind the open editor — the draft carries only position and
  // text (what the editor changes), so its thread is read from the note itself.
  const openPin = draft?.id ? note.pins.find((p) => p.id === draft.id) ?? null : null;

  // Read through refs so the "open onto this mark" effect can depend on the id
  // alone: the pins change as marks are added, and the callback is a fresh inline
  // arrow each render, but neither should re-fire the effect.
  const pinsRef = useRef(note.pins);
  pinsRef.current = note.pins;
  const onOpenedRef = useRef(onOpenedPin);
  onOpenedRef.current = onOpenedPin;

  // A caller asked to land on one mark's thread. Open its editor, then tell the
  // caller so it can clear the request — otherwise re-clicking the same fit
  // comment after closing would not re-open it (the prop would not change).
  useEffect(() => {
    if (!openPinId) return;
    const p = pinsRef.current.find((x) => x.id === openPinId);
    if (p) {
      // Opening a fit comment from the rail is to answer it, so land in the
      // reply box, not the mark's own text.
      setDraft({ id: p.id, x: p.x, y: p.y, text: p.text });
      setError("");
      setWantReplyFocus(true);
    }
    onOpenedRef.current?.();
  }, [openPinId]);

  // While the picture fills the window, the page behind it does not scroll —
  // otherwise a flick of the wheel over the photograph moves the round list
  // underneath and you come back out somewhere else. Undone on the way out and
  // on unmount, so nothing can leave the page stuck.
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [full]);

  // Keys, but never over the top of typing. A note about a left sleeve is
  // written in a textarea, and the moment an arrow key there jumped to the next
  // photograph the feature would be a trap rather than a shortcut — so anything
  // with a caret in it is left alone. Escape backs out one step at a time:
  // first the mark being written, then the viewer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.key === "Escape") {
        // One step at a time, outermost thing last: the mark being written,
        // then the full-size view, then the viewer itself.
        if (draft) setDraft(null);
        else if (full) onFull?.(false);
        else onClose();
        return;
      }
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      }
      if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, full, onFull, onPrev, onNext, onClose]);

  // A half-written reply belongs to the mark it was being written under, so
  // moving to another mark (or closing the editor) clears it rather than
  // carrying it across to answer the wrong thing.
  useEffect(() => {
    setReply("");
    setArmedReply(null);
  }, [draft?.id]);

  // When a mark was opened to reply (a "Reply" button, or a fit comment tapped
  // in the full-screen rail), move the caret into the reply box once it exists.
  // The mark's own text box autofocuses on open; this runs after and wins, so a
  // "Reply" click puts you where you can type an answer.
  useEffect(() => {
    if (wantReplyFocus && replyRef.current) {
      replyRef.current.focus();
      setWantReplyFocus(false);
    }
  }, [wantReplyFocus, draft?.id]);

  function place(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setDraft({
      id: null,
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      text: "",
    });
    setError("");
  }

  function savePin() {
    if (!draft) return;
    setError("");
    const d = draft;
    start(async () => {
      const res = await saveImagePin(styleId, sampleId, url, d);
      if (!res.ok) setError(res.error || "That didn't save.");
      else setDraft(null);
    });
  }

  function dropPin(pinId: string) {
    setArmed(null);
    setError("");
    start(async () => {
      const res = await removeImagePin(styleId, sampleId, url, pinId);
      if (!res.ok) setError(res.error || "That didn't save.");
      else setDraft((d) => (d && d.id === pinId ? null : d));
    });
  }

  function saveCaption(form: FormData) {
    setError("");
    start(async () => {
      const res = await setImageCaption(styleId, sampleId, url, form);
      if (!res.ok) setError(res.error || "That didn't save.");
    });
  }

  function sendReply() {
    const pinId = draft?.id;
    const text = reply.trim();
    if (!pinId || !text) return;
    setError("");
    start(async () => {
      const res = await addImagePinReply(styleId, sampleId, url, pinId, text);
      if (!res.ok) setError(res.error || "That didn't save.");
      else setReply("");
    });
  }

  function dropReply(replyId: string) {
    const pinId = draft?.id;
    setArmedReply(null);
    if (!pinId) return;
    setError("");
    start(async () => {
      const res = await removeImagePinReply(styleId, sampleId, url, pinId, replyId);
      if (!res.ok) setError(res.error || "That didn't save.");
    });
  }

  return (
    <div className={"ann" + (full ? " full" : "")}>
      <div className="ann-head">
        <span className="l">Fit comments on {label}</span>
        <span className="h">Click the picture to mark a point.</span>
        <div className="spacer" />

        {/* Through the set without shutting it. Disabled at the ends rather
            than wrapping round: knowing you have reached the last one matters
            more here than being able to keep pressing.

            Always drawn, never conditional (Tess, 2026-08-05: "there are no
            arrows in the header showing"). They used to appear only when there
            was somewhere to go, which meant that on the picture that is the
            only one in its set — or the first one you happen to open on a round
            with a single photograph — the controls were simply absent, and
            absent controls read as broken rather than as "nothing to move to".
            Now they are always there, greyed at the ends, with "1 of 1" between
            them saying why. */}
        {(position || onPrev || onNext) && (
          <div className="ann-nav">
            <button
              type="button"
              className="ph-link arrow"
              disabled={!onPrev}
              title="Previous picture (←)"
              aria-label="Previous picture"
              onClick={() => onPrev?.()}
            >
              ←
            </button>
            {position && <span className="p">{position}</span>}
            <button
              type="button"
              className="ph-link arrow"
              disabled={!onNext}
              title="Next picture (→)"
              aria-label="Next picture"
              onClick={() => onNext?.()}
            >
              →
            </button>
          </div>
        )}

        {/* Full size means full size OF THIS — the picture as large as the
            window allows with its marks, its caption and the arrows all still
            on it. It used to be a link to the raw file in another tab, which
            was the one view of a photograph in this tool that carried none of
            what anybody had written about it. */}
        <button
          type="button"
          className="ph-link"
          onClick={() => onFull?.(!full)}
          title={full ? "Back to the round (Esc)" : "Fill the window"}
        >
          {full ? "Exit full size" : "Full size"}
        </button>

        {/* What the old link was actually good for: downloading the original,
            or sending somebody the file itself. Kept, and named for what it
            is — but only on the card-sized view (Tess, 2026-08-05: "remove
            original file option from full size view"). Full size is for
            looking at the picture and what is written on it; a link that
            leaves the tool has no business in a view whose whole point is
            that you no longer have to leave it. Exit full size and it is
            back, one press away. */}
        {!full && (
          <span className="hide-mobile">
            <a className="ph-link" href={url} target="_blank" rel="noreferrer">
              Original file
            </a>
          </span>
        )}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => (full ? onFull?.(false) : onClose())}
        >
          Done
        </button>

        {/* Context line, its own full-width row under the header controls: what
            style this is, its number, the factory, and the fit date on a round. */}
        {meta &&
          (() => {
            const parts = [
              { v: (meta.name ?? "").trim(), title: true },
              { v: (meta.styleNo ?? "").trim() },
              { v: (meta.factory ?? "").trim() },
              { v: (meta.fitDate ?? "").trim() ? `Fit ${meta.fitDate}` : "" },
            ].filter((p) => p.v);
            return parts.length ? (
              <div className="ann-meta">
                {parts.map((p, i) => (
                  <span key={i} className={p.title ? "ann-meta-title" : undefined}>
                    {p.v}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
      </div>

      {error && <div className="ph-error">{error}</div>}

      <div className="ann-body">
        <div className="ann-stagewrap">
          {/* The stage shrinks to the picture rather than the picture filling a
              box: a mark is stored as a fraction of the image, so the element
              the click is measured against has to BE the image, exactly. An
              object-fit box with letterboxing either side would put every mark
              a few percent off. */}
          <div className="ann-stage" onClick={place} role="presentation">
            <img src={url} alt={label} />

            {note.pins.map((p, i) => (
              <button
                type="button"
                key={p.id}
                className={"ann-pin" + (draft?.id === p.id ? " on" : "")}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                title={p.text || "No fit comment yet"}
                onClick={(e) => {
                  e.stopPropagation();
                  setDraft({ id: p.id, x: p.x, y: p.y, text: p.text });
                  setError("");
                }}
              >
                {i + 1}
              </button>
            ))}

            {/* Where the new mark will land, shown before it is saved so a
                misplaced click is obvious while it can still be re-clicked. */}
            {draft && draft.id === null && (
              <span
                className="ann-pin ghost"
                style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
              >
                {note.pins.length + 1}
              </span>
            )}
          </div>
        </div>

        <div className="ann-side">
          {draft ? (
            <div className="ann-editor">
              <div className="sr-legend">
                Mark{" "}
                {draft.id
                  ? note.pins.findIndex((p) => p.id === draft.id) + 1
                  : note.pins.length + 1}
              </div>
              <textarea
                className="textarea"
                value={draft.text}
                autoFocus
                placeholder="What is happening here? — “1cm too wide, drops off the shoulder”"
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
              <div className="ann-editor-tools">
                <button type="button" className="btn sm" disabled={busy} onClick={savePin}>
                  {busy ? "Saving…" : draft.id ? "Save fit comment" : "Add fit comment"}
                </button>
                <button
                  type="button"
                  className="ph-link"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </button>
                {draft.id &&
                  (armed === draft.id ? (
                    <button
                      type="button"
                      className="ph-link danger"
                      disabled={busy}
                      onClick={() => dropPin(draft.id!)}
                      onMouseLeave={() => setArmed(null)}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ph-link"
                      disabled={busy}
                      onClick={() => setArmed(draft.id)}
                    >
                      Remove
                    </button>
                  ))}
              </div>

              {/* The thread hanging off this mark (Tess, 2026-08-17: "Reply to
                  fit comments in thread"). Only on a saved mark — a reply needs
                  something to answer, and a mark that has not been added yet has
                  no id to hang one on. One level deep, like the style comments:
                  a mark is the place on the garment, and the replies answer it.
                  Replies carry who and when because they are a conversation, not
                  more anonymous marks. */}
              {draft.id && openPin && (
                <div className="ann-thread">
                  {openPin.replies.length > 0 && (
                    <ol className="ann-replies">
                      {openPin.replies.map((r) => (
                        <li key={r.id} className="ann-reply">
                          <div className="ann-reply-meta">
                            <span className="who">{r.author || "Someone"}</span>
                            {r.at && (
                              <span className="when" suppressHydrationWarning>
                                {when(r.at)}
                              </span>
                            )}
                            <div className="spacer" />
                            {armedReply === r.id ? (
                              <button
                                type="button"
                                className="ph-link danger"
                                disabled={busy}
                                onClick={() => dropReply(r.id)}
                                onMouseLeave={() => setArmedReply(null)}
                              >
                                Remove?
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="ph-link"
                                disabled={busy}
                                onClick={() => setArmedReply(r.id)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="ann-reply-text">
                            <Linked text={r.text} block={false} />
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="ann-reply-form">
                    <textarea
                      ref={replyRef}
                      className="textarea"
                      value={reply}
                      placeholder="Reply to this fit comment…"
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={busy || !reply.trim()}
                      onClick={sendReply}
                    >
                      {busy ? "Saving…" : "Reply"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="sr-legend">
                {note.pins.length === 0
                  ? "No fit comments yet"
                  : `${note.pins.length} fit comment${note.pins.length === 1 ? "" : "s"}`}
              </div>
              {note.pins.length === 0 ? (
                <p className="ann-empty">
                  Click anywhere on the photograph. A numbered mark lands there and asks what is
                  wrong with it — the note travels with the picture, so the factory reads it against
                  the seam rather than against a paragraph.
                </p>
              ) : (
                <ol className="ann-list">
                  {/* Tess, 2026-08-06: "notes in drawer -- links added should
                      hyperlink". A fit comment routinely carries a Drive link to
                      the tech pack or a WeTransfer of the corrected pattern, and
                      until now it sat here as dead text you had to select and
                      copy.

                      The row used to be one <button> wrapping both the number
                      and the words. It cannot stay that way: an <a> inside a
                      <button> is invalid HTML and browsers disagree about which
                      one a click belongs to. So the row is now a plain div — the
                      number is the button, and the text is a sibling span run
                      through <Linked>. The span keeps its own click handler so
                      the whole row still opens the mark for editing, but a click
                      that landed on an anchor is left alone and follows the
                      link. */}
                  {note.pins.map((p, i) => (
                    <li key={p.id}>
                      <div className="ann-listrow">
                        <button
                          type="button"
                          className="ann-listnum"
                          aria-label={`Edit fit comment ${i + 1}`}
                          onClick={() => setDraft({ id: p.id, x: p.x, y: p.y, text: p.text })}
                        >
                          {i + 1}
                        </button>
                        <span
                          className="ann-listtext"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest("a")) return;
                            setDraft({ id: p.id, x: p.x, y: p.y, text: p.text });
                          }}
                        >
                          {p.text ? (
                            <Linked text={p.text} block={false} />
                          ) : (
                            <em>No fit comment yet — click to write one</em>
                          )}
                          {/* So a reviewer scanning the list can see which marks
                              have a conversation without opening each one. */}
                          {p.replies.length > 0 && (
                            <span className="ann-listreplies">
                              {p.replies.length} repl{p.replies.length === 1 ? "y" : "ies"}
                            </span>
                          )}
                        </span>
                        {/* An explicit way in, so replying is not a thing you have
                            to know to click the row for (Tess, 2026-08-17: "there
                            should be button to reply … some wouldnt know to click
                            it"). Opens the mark and drops the caret in the reply
                            box. */}
                        <button
                          type="button"
                          className="ann-listreply"
                          onClick={() => {
                            setDraft({ id: p.id, x: p.x, y: p.y, text: p.text });
                            setWantReplyFocus(true);
                          }}
                        >
                          Reply
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {/* The other half of the request, and a different thing: what this
              picture is, rather than what is wrong with it. One line, saved on
              its own, so writing it never touches a mark. Hidden where the
              picture already has a caption field of its own — see the prop. */}
          {caption && (
            <form className="ann-cap" action={saveCaption}>
              <label>Caption — what this picture is</label>
              <input
                className="input sm"
                name="caption"
                defaultValue={note.caption}
                placeholder="e.g. PPS, before the collar was corrected"
              />
              <button className="btn ghost sm" type="submit" disabled={busy}>
                Save caption
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
