"use client";

import { useState, useEffect } from "react";
import type { MBTextItem } from "@/lib/moodboard";
import { addNote, addReply, editNote, deleteNote } from "@/app/actions/moodboards";
import Linked from "@/app/components/Linked";

function fmt(ts?: number) {
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
    return "";
  }
}

export default function NotesDrawer({
  boardId,
  notes,
  me,
  canEditAll,
  canDeleteAll = false,
  readOnly = false,
}: {
  boardId: string;
  notes: MBTextItem[];
  me: string;
  canEditAll: boolean;
  /** God mode: a Delete on every note. Two-click armed, no confirm() dialog. */
  canDeleteAll?: boolean;
  readOnly?: boolean;
}) {
  // Starts closed, so a phone lands on the board rather than the notes covering
  // it (Tess, 2026-08-11: "notes drawer should always be closed when you click
  // into a page on mobile"). Desktop, where the drawer sits beside the content
  // rather than over it, opens it on mount. Server + first client render both
  // render closed, so there is no hydration mismatch.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // Which note's Delete is armed. The two-click pattern stands in for a confirm()
  // dialog, which is banned here (it freezes the browser automation).
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(min-width: 901px)").matches) setOpen(true);
  }, []);

  // Push the page content aside while the drawer is open (instead of covering it).
  useEffect(() => {
    document.body.classList.toggle("notes-open", open);
    return () => document.body.classList.remove("notes-open");
  }, [open]);

  async function saveEdit(tid: string, fd: FormData) {
    await editNote(boardId, tid, String(fd.get("text") || ""));
    setEditing(null);
  }

  async function removeNote(tid: string) {
    setArmed(null);
    await deleteNote(boardId, tid);
  }

  return (
    <>
      {!open && (
        <button className="notes-tab" onClick={() => setOpen(true)} title="Show notes">
          ‹ Notes{notes.length ? ` · ${notes.length}` : ""}
        </button>
      )}
      <aside className={"notes-drawer" + (open ? " open" : "")}>
        <div className="notes-drawer-head">
          <span>Notes</span>
          <button className="notes-close" onClick={() => setOpen(false)} title="Hide notes">
            ›
          </button>
        </div>

        <div className="notes-drawer-body">
          {notes.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              No notes yet. Start one below.
            </div>
          ) : (
            notes.map((n) => {
              const canEdit = canEditAll || (!!me && n.by === me);
              const isEditing = editing === n.tid;
              return (
                <div className="note" key={n.tid}>
                  <div className="note-meta">
                    <span className="note-by">{n.by || "Someone"}</span>
                    <span className="note-when" suppressHydrationWarning>
                      {fmt(n.ts)}
                    </span>
                    {!readOnly && canEdit && !isEditing && (
                      <button className="note-edit" onClick={() => setEditing(n.tid)}>
                        Edit
                      </button>
                    )}
                    {!readOnly && canDeleteAll && !isEditing && (
                      <button
                        className={"note-del" + (armed === n.tid ? " armed" : "")}
                        onClick={() => (armed === n.tid ? removeNote(n.tid) : setArmed(n.tid))}
                        onMouseLeave={() => armed === n.tid && setArmed(null)}
                        title="God mode: delete this note"
                      >
                        {armed === n.tid ? "Delete?" : "Delete"}
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <form action={(fd) => saveEdit(n.tid, fd)} className="note-edit-form">
                      <textarea className="textarea" name="text" defaultValue={n.text} style={{ minHeight: 70 }} />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button className="btn sm" type="submit">Save</button>
                        <button className="btn link" type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <Linked className="note-text" text={n.text} />
                  )}

                  {(n.replies ?? []).length > 0 && (
                    <div className="note-replies">
                      {(n.replies ?? []).map((r) => (
                        <div className="note-reply" key={r.id}>
                          <div className="note-meta">
                            <span className="note-by">{r.by || "Someone"}</span>
                            <span className="note-when" suppressHydrationWarning>
                              {fmt(r.ts)}
                            </span>
                          </div>
                          <Linked className="note-text" text={r.text} />
                        </div>
                      ))}
                    </div>
                  )}

                  {!readOnly && !isEditing && (
                    <form action={addReply.bind(null, boardId, n.tid)} className="note-reply-form">
                      <input className="input sm" name="text" placeholder="Reply…" autoComplete="off" />
                      <button className="btn ghost sm" type="submit">Reply</button>
                    </form>
                  )}
                </div>
              );
            })
          )}
        </div>

        {!readOnly && (
          <form action={addNote.bind(null, boardId)} className="note-add">
            <textarea className="textarea" name="text" placeholder="Add a note…" style={{ minHeight: 64 }} />
            <button className="btn sm" type="submit">Add note</button>
          </form>
        )}
      </aside>
    </>
  );
}
