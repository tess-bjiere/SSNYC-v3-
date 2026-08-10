"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refThumb } from "@/lib/types";
import { searchReferences, linkReference, type LinkableReference } from "@/app/actions/styleRefs";

// "Link a reference" — the missing direction (Tess, 2026-08-04).
//
// A style has always been able to carry several library references: the join
// table's primary key is (style_id, reference_id), so the many-to-many was
// there from the first migration and "Developed from" already renders all of
// them. What was missing was a way to say so *from the style*. Linking only
// happened from the reference side — open something in the Library or on a
// board, choose "Develop this" — so standing on a style profile, the field
// looked like it held exactly one thing and there was no way to add a second.
//
// Hence this: search the library without leaving the style, link as many as you
// want, watch them appear in the strip above. linkReference is an upsert with
// ignoreDuplicates, so linking something already linked is a no-op rather than
// an error — which matters, because the same reference can be reached from the
// library, a board and now here.
//
// Closed by default. The common case is a profile that already has what it
// needs; a search box sitting open on every style is a question nobody asked.

function refLabel(r: LinkableReference): { top: string; sub: string } {
  const top = r.designer || "Untitled";
  const sub = [r.year && r.year !== "Unknown" ? r.year : null, r.season, r.garment]
    .filter(Boolean)
    .join(" · ");
  return { top, sub };
}

export default function LinkReference({
  styleId,
  linkedIds,
}: {
  styleId: string;
  /** Already on this style — filtered out server-side so nothing offered is a no-op. */
  linkedIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LinkableReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [justLinked, setJustLinked] = useState<string[]>([]);
  const [pending, start] = useTransition();

  // Search as you type, 250ms behind the keystrokes. Long enough that a name
  // typed at speed is one query rather than nine, short enough that it never
  // feels like it is waiting for you to stop.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      searchReferences(q, [...linkedIds, ...justLinked])
        .then((rows) => {
          if (live) setResults(rows);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // justLinked is in the deps so a linked card leaves the results list.
  }, [q, open, linkedIds.join(","), justLinked.join(",")]);

  function link(id: string) {
    start(async () => {
      const res = await linkReference(styleId, id);
      if (res.ok) {
        // Optimistically drop it from the picker, then let the server re-render
        // the strip above. Both, because the strip is server-rendered and the
        // picker is not — without the first, the card sits there looking
        // un-linked for the length of a round trip.
        setJustLinked((cur) => [...cur, id]);
        setResults((cur) => cur.filter((r) => r.id !== id));
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button className="btn link" type="button" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>
        Link a reference
      </button>
    );
  }

  return (
    <div className="linkref">
      <div className="linkref-head">
        <input
          className="input"
          value={q}
          autoFocus
          placeholder="Search the library — designer, garment, season, year"
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn link" type="button" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>

      {loading && results.length === 0 ? (
        <div className="linkref-msg">Searching…</div>
      ) : results.length === 0 ? (
        <div className="linkref-msg">
          {q.trim()
            ? "Nothing in the library matches that."
            : "Nothing left to link — everything in the library is already on this style."}
        </div>
      ) : (
        <div className="linkref-grid">
          {results.map((r) => {
            const src = refThumb(r);
            const { top, sub } = refLabel(r);
            return (
              <div className="linkref-card" key={r.id}>
                <div className="linkref-img">{src ? <img src={src} alt={top} /> : null}</div>
                <div className="linkref-meta">
                  <div className="d">{top}</div>
                  {sub && <div className="s">{sub}</div>}
                </div>
                <button className="btn sm" type="button" disabled={pending} onClick={() => link(r.id)}>
                  Link
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="linkref-hint">
        A style can be developed from as many references as you like — link a silhouette from one and
        a collar from another. Linking never changes the reference itself.
      </div>
    </div>
  );
}
