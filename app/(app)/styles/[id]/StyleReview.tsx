"use client";

/* Tess, 2026-08-24: "Add ability to have thread of notes viewable in the full
   screen version of the style if you're on a product tab".

   A present/review mode for the whole style: its pictures large on one side and
   the notes thread beside them, so a fit review can be read off one screen
   without the working profile around it. Deliberately read-only — this is for
   looking and talking through, not for editing; the drawer on the profile is
   still where a note gets written, replied to or deleted. Opening this never
   touches the database. */

import { useEffect, useState } from "react";
import Linked from "@/app/components/Linked";

export type ReviewNote = {
  id: string;
  author: string | null;
  body: string | null;
  created_at: string | null;
  round?: string | null;
};
export type ReviewThread = { comment: ReviewNote; replies: ReviewNote[] };
export type ReviewImage = { url: string; caption: string };

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function NoteHead({ n }: { n: ReviewNote }) {
  return (
    <div className="review-note-meta">
      <span className="review-by">{n.author || "Someone"}</span>
      <span className="review-when" suppressHydrationWarning>
        {when(n.created_at)}
      </span>
      {n.round && <span className="review-scope">{n.round}</span>}
    </div>
  );
}

export default function StyleReview({
  name,
  styleNo,
  garment,
  factory,
  status,
  images,
  threads,
  count,
}: {
  name: string;
  styleNo: string | null;
  garment: string | null;
  factory: string | null;
  status: string | null;
  images: ReviewImage[];
  threads: ReviewThread[];
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight")
        setI((n) => Math.min(n + 1, Math.max(images.length - 1, 0)));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    // Lock the page behind the overlay so the profile does not scroll under it.
    document.body.classList.add("review-lock");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("review-lock");
    };
  }, [open, images.length]);

  const cur = images[Math.min(i, Math.max(images.length - 1, 0))] ?? null;
  const sub = [styleNo, garment, factory].filter(Boolean).join("  ·  ");

  return (
    <>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => {
          setI(0);
          setOpen(true);
        }}
      >
        Full screen
      </button>

      {open && (
        <div className="review" role="dialog" aria-modal="true" aria-label={`${name} full screen`}>
          <div className="review-bar">
            <div className="review-id">
              <span className="review-name">{name || "Untitled"}</span>
              {sub && <span className="review-sub">{sub}</span>}
              {status && <span className="review-status">{status}</span>}
            </div>
            <button
              type="button"
              className="review-x"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="review-body">
            <div className="review-stage">
              {cur ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="review-img" src={cur.url} alt={cur.caption || name} />
              ) : (
                <div className="review-empty">No images yet</div>
              )}
              {cur?.caption && <div className="review-cap">{cur.caption}</div>}
              {images.length > 1 && (
                <div className="review-strip">
                  {images.map((im, n) => (
                    <button
                      key={im.url + n}
                      type="button"
                      className={"review-thumb" + (n === i ? " on" : "")}
                      onClick={() => setI(n)}
                      aria-label={im.caption || `Image ${n + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={im.url} alt={im.caption || ""} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="review-notes">
              <div className="review-notes-head">Notes{count ? ` · ${count}` : ""}</div>
              {threads.length === 0 ? (
                <p className="review-none">No notes yet.</p>
              ) : (
                threads.map((t) => (
                  <div className="review-note" key={t.comment.id}>
                    <NoteHead n={t.comment} />
                    <Linked className="review-text" text={t.comment.body ?? ""} />
                    {t.replies.length > 0 && (
                      <div className="review-replies">
                        {t.replies.map((r) => (
                          <div className="review-reply" key={r.id}>
                            <NoteHead n={r} />
                            <Linked className="review-text" text={r.body ?? ""} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
