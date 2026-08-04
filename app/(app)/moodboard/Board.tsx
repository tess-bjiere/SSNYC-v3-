"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import EditableDivider from "./EditableDivider";
import { reorderImages, removeImageFromBoard } from "@/app/actions/moodboards";
import DetailModal from "@/app/(app)/library/DetailModal";
import type { Reference } from "@/lib/types";

// Every tile on a board renders at the same size — the board-wide S/M/L control
// sets it. Image items still carry a per-image `w` in the database from the old
// tool; it is ignored here and never rewritten.
// `dev` is the styles already being developed from this tile's reference. It is
// read once for the whole board on the server (see page.tsx) and is display-only:
// a moodboard never creates, edits or removes a style ⇄ reference link.
type Tile = {
  iid: string;
  src: string;
  title: string;
  ref: Reference | null;
  dev: { id: string; name: string }[];
};
type Sec = { tid?: string; label: string | null; images: Tile[] };

export default function Board({ boardId, sections: initial }: { boardId: string; sections: Sec[] }) {
  const [sections, setSections] = useState<Sec[]>(initial);
  const [dragIid, setDragIid] = useState<string | null>(null);
  const [overIid, setOverIid] = useState<string | null>(null);
  // Clicking a tile opens the reference detail card (same card as the Library,
  // minus Delete — see DetailModal's `actions` prop).
  const [detail, setDetail] = useState<Reference | null>(null);
  const [toast, setToast] = useState("");
  // A drag ends with a click event in some browsers; this stops a reorder from
  // also opening the detail card.
  const dragged = useRef(false);
  // Removal is two clicks, never a browser confirm(): × arms the tile, the second
  // click on "Remove?" does it. Clicking anywhere else disarms.
  const [armedIid, setArmedIid] = useState<string | null>(null);

  // Re-sync from the server when the board's content actually changes
  // (new refs added, board switched, etc.) without clobbering local drags.
  const sig = flatten(initial).join(",");
  useEffect(() => {
    setSections(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  function flatten(secs: Sec[]) {
    const ids: string[] = [];
    for (const s of secs) {
      if (s.tid) ids.push(s.tid);
      for (const im of s.images) ids.push(im.iid);
    }
    return ids;
  }

  function move(iid: string, secIdx: number, beforeIid: string | null) {
    let tile: Tile | undefined;
    for (const s of sections) {
      const f = s.images.find((im) => im.iid === iid);
      if (f) tile = f;
    }
    if (!tile) return;
    const next = sections.map((s) => ({ ...s, images: s.images.filter((im) => im.iid !== iid) }));
    const target = next[secIdx];
    if (beforeIid && beforeIid !== iid) {
      const idx = target.images.findIndex((im) => im.iid === beforeIid);
      target.images.splice(idx < 0 ? target.images.length : idx, 0, tile);
    } else {
      target.images.push(tile);
    }
    setSections(next);
    setDragIid(null);
    setOverIid(null);
    reorderImages(boardId, flatten(next));
  }

  // Swap a whole section with its neighbour. Only sections that have a divider can
  // move; the leading and trailing unsectioned groups stay where they are.
  function moveSection(si: number, dir: -1 | 1) {
    const to = si + dir;
    const next = [...sections];
    if (to < 0 || to >= next.length || !next[to].tid || !next[si].tid) return;
    [next[si], next[to]] = [next[to], next[si]];
    setSections(next);
    reorderImages(boardId, flatten(next));
  }

  // Take one image off the board. The reference stays in the library — this only
  // removes the tile, and only the tile with this iid.
  function removeTile(iid: string) {
    setArmedIid(null);
    setSections(sections.map((s) => ({ ...s, images: s.images.filter((im) => im.iid !== iid) })));
    removeImageFromBoard(boardId, iid);
  }

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  }

  return (
    <>
      {sections.map((s, si) => (
        <div
          className="mb-sec"
          key={s.tid || si}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIid) move(dragIid, si, null);
          }}
        >
          <div className="mb-sec-bar">
            <EditableDivider boardId={boardId} tid={s.tid} label={s.label} />
            {s.tid && (
              <div className="mb-sec-move">
                <button
                  className="mb-sec-arrow"
                  onClick={() => moveSection(si, -1)}
                  disabled={si === 0 || !sections[si - 1]?.tid}
                  title="Move section up"
                >
                  ↑
                </button>
                <button
                  className="mb-sec-arrow"
                  onClick={() => moveSection(si, 1)}
                  disabled={si === sections.length - 1 || !sections[si + 1]?.tid}
                  title="Move section down"
                >
                  ↓
                </button>
              </div>
            )}
          </div>

          <div className="mb-row">
            {s.images.map((im) => (
              <div
                className={"mb-tile" + (dragIid === im.iid ? " dragging" : "") + (overIid === im.iid ? " over" : "")}
                key={im.iid}
                draggable
                onDragStart={() => {
                  dragged.current = true;
                  setDragIid(im.iid);
                }}
                onDragEnd={() => {
                  setDragIid(null);
                  setOverIid(null);
                  setTimeout(() => { dragged.current = false; }, 0);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIid && dragIid !== im.iid) setOverIid(im.iid);
                }}
                onDragLeave={() => setOverIid((o) => (o === im.iid ? null : o))}
                onMouseLeave={() => setArmedIid((a) => (a === im.iid ? null : a))}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragIid) move(dragIid, si, im.iid);
                }}
                onClick={() => {
                  if (dragged.current || !im.ref) return;
                  setArmedIid(null);
                  setDetail(im.ref);
                }}
                title={im.title}
              >
                <img src={im.src} alt="" loading="lazy" draggable={false} />

                {/* Already being made. The tag is a shortcut to the profile, so it
                    swallows the click that would otherwise open the detail card.
                    It is hidden during a PNG export (see ExportButton) — an
                    exported board is a client-facing image, not a status report. */}
                {im.dev.length > 0 && (
                  <Link
                    href={`/styles/${im.dev[0].id}`}
                    className="mb-dev-tag"
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    title={
                      im.dev.length === 1
                        ? `In development: ${im.dev[0].name}`
                        : `In development: ${im.dev.map((d) => d.name).join(", ")}`
                    }
                  >
                    {im.dev[0].name}
                    {im.dev.length > 1 ? ` +${im.dev.length - 1}` : ""}
                  </Link>
                )}

                <div className="mb-del-ctl" draggable={false} onDragStart={(e) => e.preventDefault()}>
                  {armedIid === im.iid ? (
                    <button
                      className="mb-del-confirm"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); removeTile(im.iid); }}
                      title="Remove this image from the board (the reference stays in the library)"
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setArmedIid(im.iid); }}
                      title="Remove from board"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            {s.images.length === 0 && <div className="mb-drop-hint">Drop images here</div>}
          </div>
        </div>
      ))}

      {detail && (
        <DetailModal
          r={detail}
          actions="board"
          onClose={() => setDetail(null)}
          onToast={flashToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
