"use client";

import { useState } from "react";
import { editDivider, deleteDivider } from "@/app/actions/moodboards";

export default function EditableDivider({
  boardId,
  tid,
  label,
}: {
  boardId: string;
  tid?: string;
  label: string | null;
}) {
  const [editing, setEditing] = useState(false);

  // Unsectioned group (no divider) — not editable.
  if (!tid) return <div className="mb-sec-head">{label || " "}</div>;

  async function save(fd: FormData) {
    await editDivider(boardId, tid!, String(fd.get("text") || ""));
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mb-sec-edit">
        <form action={save} style={{ display: "flex", gap: 6, flex: 1, minWidth: 0 }}>
          <input className="input" name="text" defaultValue={label || ""} autoFocus autoComplete="off" />
          <button className="btn sm" type="submit">Save</button>
        </form>
        <button className="btn link" type="button" onClick={() => setEditing(false)}>Cancel</button>
        <form action={deleteDivider.bind(null, boardId, tid!)}>
          <button className="btn link danger" type="submit" title="Delete this section header">Delete</button>
        </form>
      </div>
    );
  }

  return (
    <div
      className="mb-sec-head mb-sec-editable"
      onClick={() => setEditing(true)}
      title="Click to rename section"
    >
      {label || "Untitled section"}
      <span className="mb-sec-pencil">Edit</span>
    </div>
  );
}
