"use client";

import { useState } from "react";
import type { MBTextItem } from "@/lib/moodboard";
import { addNote, addReply, editNote, deleteNote } from "@/app/actions/moodboards";
import Linked from "@/app/components/Linked";

// The notes for one scope — a single item/look group (sectionTid set), or the
// board as a whole (sectionTid null) — the list plus the add box (Tess,
// 2026-10-01: "moodboard can be organized by item or look -- allowing multiple
// reference images and notes"). Lifted out of the old side drawer so the exact
// same note UI can sit inline under each group. The add form carries sectionTid
// as a hidden field, so a note lands on the group it was written under.

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

export default function NotesPanel({
  boardId,
  sectionTid,
  notes,
  me,
  canEditAll,
  canDeleteAll = false,
  readOnly = false,
  placeholder = "Add a note…",
}: {
  boardId: string;
  /** The group this panel's notes belong to; null for board-level notes. */
  sectionTid: string | null;
  notes: MBTextItem[];
  me: string;
  canEditAll: boolean;
  canDeleteAll?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // Two-click delete arm, standing in for the banned confirm() dialog.
  const [armed, setArmed] = useState<string | null>(null);

  async function saveEdit(tid: string, fd: FormData) {
    await editNote(boardId, tid, String(fd.get("text") || ""));
    setEditing(null);
  }
  async function removeNote(tid: string) {
    setArmed(null);
    await deleteNote(boardId, tid);
  }

  return (
    <div className="mb-notes">
      {notes.map((n) => {
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
      })}

      {!readOnly && (
        <form action={addNote.bind(null, boardId)} className="note-add">
          {/* The group this note belongs to; read back in addNote. */}
          <input type="hidden" name="sectionTid" value={sectionTid ?? ""} />
          <textarea className="textarea" name="text" placeholder={placeholder} style={{ minHeight: 56 }} />
          <button className="btn sm" type="submit">Add note</button>
        </form>
      )}
    </div>
  );
}
