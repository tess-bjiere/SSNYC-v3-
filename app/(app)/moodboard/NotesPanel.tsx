"use client";

import { useState } from "react";
import type { MBTextItem } from "@/lib/moodboard";
import { addNote, addReply, editNote, deleteNote } from "@/app/actions/moodboards";
import Linked from "@/app/components/Linked";

// The notes for one scope — a single item/look group (sectionTid set), or the
// board as a whole (sectionTid null) — the list plus the add box (Tess,
// 2026-10-01: "moodboard can be organized by item or look -- allowing multiple
// reference images and notes"). The add form carries sectionTid as a hidden
// field, so a note lands on the group it was written under.
//
// Tess, 2026-10-02: "a better idea for the notes section underneath each to make
// it less clunky". A board shows one of these under every look, so the chrome is
// pared back: a note is a quiet "Name · text" line, its timestamp and actions
// appear on hover (.mbn-meta), and the composer stays collapsed to a faint
// "＋ Add note" until clicked. Replies open the same way, on demand. The .mbn-*
// classes are this panel's own — the side-drawer and sample-round threads keep
// the heavier .note* look they share.

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
  // The composer and each reply box stay collapsed until asked for, so a look
  // with no notes shows just the "＋ Add note" link and nothing else.
  const [adding, setAdding] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);

  async function saveEdit(tid: string, fd: FormData) {
    await editNote(boardId, tid, String(fd.get("text") || ""));
    setEditing(null);
  }
  async function removeNote(tid: string) {
    setArmed(null);
    await deleteNote(boardId, tid);
  }
  // Wrap the add/reply server actions so the box closes once the write lands
  // (the revalidate then brings the new note/reply back in on its own).
  async function submitNote(fd: FormData) {
    await addNote(boardId, fd);
    setAdding(false);
  }
  async function submitReply(tid: string, fd: FormData) {
    await addReply(boardId, tid, fd);
    setReplying(null);
  }

  return (
    <div className="mb-notes">
      {notes.map((n) => {
        const canEdit = canEditAll || (!!me && n.by === me);
        const isEditing = editing === n.tid;
        return (
          <div className="mbn-note" key={n.tid}>
            {isEditing ? (
              <form action={(fd) => saveEdit(n.tid, fd)} className="mbn-form">
                <textarea className="textarea" name="text" defaultValue={n.text} style={{ minHeight: 70 }} />
                <div className="mbn-form-row">
                  <button className="btn sm" type="submit">Save</button>
                  <button className="mbn-act" type="button" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="mbn-line">
                <span className="mbn-by">{n.by || "Someone"}</span>
                <Linked className="mbn-text" text={n.text} block={false} />
              </div>
            )}

            {(n.replies ?? []).length > 0 && (
              <div className="mbn-replies">
                {(n.replies ?? []).map((r) => (
                  <div className="mbn-line" key={r.id}>
                    <span className="mbn-by">{r.by || "Someone"}</span>
                    <Linked className="mbn-text" text={r.text} block={false} />
                  </div>
                ))}
              </div>
            )}

            {!readOnly && !isEditing && (
              <div className="mbn-meta">
                <span className="mbn-when" suppressHydrationWarning>{fmt(n.ts)}</span>
                {replying !== n.tid && (
                  <button className="mbn-act" onClick={() => setReplying(n.tid)}>Reply</button>
                )}
                {canEdit && (
                  <button className="mbn-act" onClick={() => setEditing(n.tid)}>Edit</button>
                )}
                {canDeleteAll && (
                  <button
                    className={"mbn-act danger" + (armed === n.tid ? " armed" : "")}
                    onClick={() => (armed === n.tid ? removeNote(n.tid) : setArmed(n.tid))}
                    onMouseLeave={() => armed === n.tid && setArmed(null)}
                    title="God mode: delete this note"
                  >
                    {armed === n.tid ? "Delete?" : "Delete"}
                  </button>
                )}
              </div>
            )}

            {!readOnly && replying === n.tid && (
              <form action={(fd) => submitReply(n.tid, fd)} className="mbn-reply-form">
                <input className="input sm" name="text" placeholder="Reply…" autoComplete="off" autoFocus />
                <button className="btn ghost sm" type="submit">Reply</button>
                <button className="mbn-act" type="button" onClick={() => setReplying(null)}>Cancel</button>
              </form>
            )}
          </div>
        );
      })}

      {!readOnly &&
        (adding ? (
          <form action={submitNote} className="mbn-form">
            {/* The group this note belongs to; read back in addNote. */}
            <input type="hidden" name="sectionTid" value={sectionTid ?? ""} />
            <textarea className="textarea" name="text" placeholder={placeholder} autoFocus />
            <div className="mbn-form-row">
              <button className="btn sm" type="submit">Add note</button>
              <button className="mbn-act" type="button" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button className="mbn-add" onClick={() => setAdding(true)}>
            <span className="pl">＋</span> Add note
          </button>
        ))}
    </div>
  );
}
