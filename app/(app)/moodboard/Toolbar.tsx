"use client";

import Select from "@/app/components/Select";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBoard, addDivider, archiveBoard } from "@/app/actions/moodboards";
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

      {!showingArchived && (
        <form action={createBoard} className="mb-newboard">
          <input className="input" name="name" placeholder="New board…" />
          <button className="btn ghost" type="submit">+ Board</button>
        </form>
      )}

      {!showingArchived && currentId && (
        <form action={addDivider.bind(null, currentId)}>
          <button className="btn ghost" type="submit">+ Divider</button>
        </form>
      )}

      <div className="mb-spacer" />

      <SizeToggle value={size} onChange={choose} />

      <button className="btn link" onClick={share}>
        {copied ? "Copied ✓" : "Share link"}
      </button>

      {!showingArchived && <ExportButton name={currentName} />}

      {currentId && (
        <form action={archiveBoard.bind(null, currentId, !showingArchived)}>
          <button className="btn ghost" type="submit">
            {showingArchived ? "Unarchive" : "Archive"}
          </button>
        </form>
      )}

      {showingArchived ? (
        <a className="btn link" href="/moodboard">← Active boards</a>
      ) : archivedCount > 0 ? (
        <a className="btn link" href="/moodboard?archived=1">Archived · {archivedCount}</a>
      ) : null}
    </div>
  );
}
