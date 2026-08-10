"use client";

import { useState, useEffect } from "react";
import type { MBTextItem } from "@/lib/moodboard";
import { addNote, addReply, editNote } from "@/app/actions/moodboards";

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
  readOnly = false,
}: {
  boardId: string;
  notes: MBTextItem[];
  me: string;
  canEditAll: boolean;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  // Push the page content aside while the drawer is open (instead of covering it).
  useEffect(() => {
    document.body.classList.toggle("notes-open", open);
    return () => document.body.classList.remove("notes-open");
  }, [open]);

  async function saveEdit(tid: string, fd: FormData) {
    await editNote(boardId, tid, String(fd.get("text") || ""));
    setEditing(null);
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
                    <div className="note-text" style={{ whiteSpace: "pre-wrap" }}>
                      {n.text}
                    </div>
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
                          <div className="note-text" style={{ whiteSpace: "pre-wrap" }}>
                            {r.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!readOnly && !isEditing && (
                    <form action={addReply.bind(null, boardId, n.tid)} className="note-reply-form">
                      <input className="input" name="text" placeholder="Reply…" autoComplete="off" />
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
