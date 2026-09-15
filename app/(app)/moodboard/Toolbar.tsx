"use client";

import Select from "@/app/components/Select";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBoard, addDivider, renameBoard } from "@/app/actions/moodboards";
import ExportButton from "./ExportButton";
import SizeToggle from "@/app/components/SizeToggle";

export default function Toolbar({
  boards,
  currentId,
  currentName,
  showingArchived,
  archivedCount,
}: {
  boards: { id: string; name: string }[];
  currentId: string;
  currentName: string;
  showingArchived: boolean;
  archivedCount: number;
}) {
  const router = useRouter();
  const [size, setSize] = useState("md");
  const [copied, setCopied] = useState(false);
  // "+ Board" opens a modal rather than an always-open field (Tess, 2026-08-11:
  // "+board should pop up a modal for a new board -- we don't need the open field
  // on the moodboard page at all times"). createBoard redirects to the new board,
  // so the modal goes away with the navigation.
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  // Rename the current board (Tess, 2026-09-15: "how do i edit a moodboard name?").
  // The renameBoard action existed but was never wired to the UI; this is the way
  // in. A small modal pre-filled with the name, like New board — but renameBoard
  // does not redirect, so the client closes it and refreshes the label itself.
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(currentName);
  const [renaming, startRename] = useTransition();

  function openRename() {
    setRenameName(currentName);
    setRenameOpen(true);
  }
  function submitRename() {
    const name = renameName.trim();
    if (!name || !currentId) return;
    startRename(async () => {
      const fd = new FormData();
      fd.set("name", name);
      await renameBoard(currentId, fd);
      setRenameOpen(false);
      router.refresh();
    });
  }

  useEffect(() => {
    let s = "md";
    try {
      s = localStorage.getItem("ssync_tilesize") || "md";
    } catch {}
    apply(s);
    setSize(s);
  }, []);

  function apply(s: string) {
    document.body.classList.remove("tiles-sm", "tiles-md", "tiles-lg");
    document.body.classList.add("tiles-" + s);
  }
  function choose(s: string) {
    setSize(s);
    apply(s);
    try {
      localStorage.setItem("ssync_tilesize", s);
    } catch {}
  }

  function share() {
    // Public, view-only link — recipients don't need to log in.
    const url = `${window.location.origin}/share/${currentId}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="mb-toolbar">
      <Select
        className="select mb-boardsel"
        aria-label="Board"
        value={currentId}
        onChange={(v) => router.push(`/moodboard?board=${v}${showingArchived ? "&archived=1" : ""}`)}
        options={boards.map((b) => ({ value: b.id, label: b.name }))}
      />

      {currentId && (
        <button
          className="btn ghost sm mb-rename"
          type="button"
          onClick={openRename}
          title="Rename this board"
        >
          Rename
        </button>
      )}

      {!showingArchived && (
        <button className="btn ghost" type="button" onClick={() => setNewBoardOpen(true)}>
          + Board
        </button>
      )}

      {!showingArchived && currentId && (
        <form action={addDivider.bind(null, currentId)}>
          <button className="btn ghost" type="submit">+ Divider</button>
        </form>
      )}

      <div className="mb-spacer" />

      <SizeToggle value={size} onChange={choose} />

      {/* The link-actions ride together. On a phone the group wraps to its own
          row below the board controls — Export PNG then Share link (Tess,
          2026-08-11: "move share link to row below next to export png") — while
          the size icons stay up on the row above, at the right. On desktop the
          wrapper is transparent (display:contents) so they sit inline as before.
          Archive (the action) moved to the foot of the page; this stays the way
          IN to the archived view. */}
      <div className="mb-t-links">
        {!showingArchived && <ExportButton name={currentName} />}

        <button className="btn link mb-share" onClick={share}>
          {copied ? "Copied ✓" : "Share link"}
        </button>

        {showingArchived ? (
          <a className="btn link" href="/moodboard">← Active boards</a>
        ) : archivedCount > 0 ? (
          <a className="btn link" href="/moodboard?archived=1">Archived · {archivedCount}</a>
        ) : null}
      </div>

      {renameOpen && (
        <div className="modal-overlay">
          <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Rename board">
            <div className="modal-head">
              <span>Rename board</span>
              <button className="notes-close" type="button" aria-label="Close" onClick={() => setRenameOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <form
                className="mb-newboard-form"
                onSubmit={(e) => { e.preventDefault(); submitRename(); }}
              >
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input
                  className="input"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  placeholder="Board name…"
                  autoFocus
                  autoComplete="off"
                />
                <button className="btn" type="submit" disabled={renaming || !renameName.trim()}>
                  {renaming ? "Saving…" : "Save"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {newBoardOpen && (
        <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
          <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="New board">
            <div className="modal-head">
              <span>New board</span>
              <button className="notes-close" type="button" aria-label="Close" onClick={() => setNewBoardOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <form action={createBoard} className="mb-newboard-form">
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input className="input" name="name" placeholder="Board name…" autoFocus autoComplete="off" />
                <button className="btn" type="submit">Create board</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
