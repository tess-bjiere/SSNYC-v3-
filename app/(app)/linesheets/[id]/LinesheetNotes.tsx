"use client";

import { useEffect, useState } from "react";
import type { Note } from "@/lib/notes";
import {
  addLinesheetNote,
  addLinesheetReply,
  editLinesheetNote,
  deleteLinesheetNote,
} from "@/app/actions/linesheets";
import Linked from "@/app/components/Linked";

// Notes on a linesheet, the same drawer the moodboard uses (Tess, 2026-08-12:
// "users would have the ability to leave notes in it like the moodboard").
// Reuses the .notes-* styles; starts closed (the sheet is the focus, you open the
// notes when you want them) and never prints. Author edits their own note; god
// mode edits or deletes any — the two-click Delete stands in for a confirm().

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

export default function LinesheetNotes({
  linesheetId,
  notes,
  me,
  canDeleteAll = false,
}: {
  linesheetId: string;
  notes: Note[];
  me: string;
  /** God mode: a Delete on every note, and edit on anyone's. */
  canDeleteAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  // Push the page aside while open, and never leave the class behind on unmount.
  useEffect(() => {
    document.body.classList.toggle("notes-open", open);
    return () => document.body.classList.remove("notes-open");
  }, [open]);

  async function saveEdit(tid: string, fd: FormData) {
    await editLinesheetNote(linesheetId, tid, String(fd.get("text") || ""));
    setEditing(null);
  }

  async function removeNote(tid: string) {
    setArmed(null);
    await deleteLinesheetNote(linesheetId, tid);
  }

  return (
    <>
      {!open && (
        <button className="notes-tab no-print" onClick={() => setOpen(true)} title="Show notes">
          ‹ Notes{notes.length ? ` · ${notes.length}` : ""}
        </button>
      )}
      <aside className={"notes-drawer no-print" + (open ? " open" : "")}>
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
              const canEdit = canDeleteAll || (!!me && n.by === me);
              const isEditing = editing === n.tid;
              return (
                <div className="note" key={n.tid}>
                  <div className="note-meta">
                    <span className="note-by">{n.by || "Someone"}</span>
                    <span className="note-when" suppressHydrationWarning>
                      {fmt(n.ts)}
                    </span>
                    {canEdit && !isEditing && (
                      <button className="note-edit" onClick={() => setEditing(n.tid)}>
                        Edit
                      </button>
                    )}
                    {canDeleteAll && !isEditing && (
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
                      <textarea
                        className="textarea"
                        name="text"
                        defaultValue={n.text}
                        style={{ minHeight: 70 }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button className="btn sm" type="submit">
                          Save
                        </button>
                        <button className="btn link" type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <Linked className="note-text" text={n.text} />
                  )}

                  {n.replies.length > 0 && (
                    <div className="note-replies">
                      {n.replies.map((r) => (
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

                  {!isEditing && (
                    <form
                      action={addLinesheetReply.bind(null, linesheetId, n.tid)}
                      className="note-reply-form"
                    >
                      <input className="input sm" name="text" placeholder="Reply…" autoComplete="off" />
                      <button className="btn ghost sm" type="submit">
                        Reply
                      </button>
                    </form>
                  )}
                </div>
              );
            })
          )}
        </div>

        <form action={addLinesheetNote.bind(null, linesheetId)} className="note-add">
          <textarea
            className="textarea"
            name="text"
            placeholder="Add a note…"
            style={{ minHeight: 64 }}
          />
          <button className="btn sm" type="submit">
            Add note
          </button>
        </form>
      </aside>
    </>
  );
}
