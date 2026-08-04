"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBoard, addDivider, archiveBoard } from "@/app/actions/moodboards";
import ExportButton from "./ExportButton";

const SIZES: [string, string][] = [
  ["sm", "S"],
  ["md", "M"],
  ["lg", "L"],
];

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
      <select
        className="select mb-boardsel"
        value={currentId}
        onChange={(e) =>
          router.push(`/moodboard?board=${e.target.value}${showingArchived ? "&archived=1" : ""}`)
        }
      >
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      {!showingArchived && (
        <form action={createBoard} className="mb-newboard">
          <input className="input" name="name" placeholder="New board…" />
          <button className="btn ghost sm" type="submit">+ Board</button>
        </form>
      )}

      {!showingArchived && currentId && (
        <form action={addDivider.bind(null, currentId)}>
          <button className="btn ghost sm" type="submit">+ Divider</button>
        </form>
      )}

      <div className="mb-spacer" />

      <div className="mb-sizes" title="Image size">
        {SIZES.map(([k, l]) => (
          <button key={k} className={"mb-size" + (size === k ? " active" : "")} onClick={() => choose(k)}>
            {l}
          </button>
        ))}
      </div>

      <button className="btn ghost sm" onClick={share}>
        {copied ? "Copied ✓" : "Share link"}
      </button>

      {!showingArchived && <ExportButton name={currentName} />}

      {currentId && (
        <form action={archiveBoard.bind(null, currentId, !showingArchived)}>
          <button className="btn ghost sm" type="submit">
            {showingArchived ? "Unarchive" : "Archive"}
          </button>
        </form>
      )}

      {showingArchived ? (
        <a className="btn ghost sm" href="/moodboard">← Active boards</a>
      ) : archivedCount > 0 ? (
        <a className="btn ghost sm" href="/moodboard?archived=1">Archived · {archivedCount}</a>
      ) : null}
    </div>
  );
}
