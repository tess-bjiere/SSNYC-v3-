"use client";

import { useState } from "react";
import Link from "next/link";
import {
  filterRollout,
  shotListLine,
  worstSlot,
  type RolloutRow,
  type RolloutSummary,
  type RolloutView,
} from "@/lib/photoRollout";
import { styleCoverUrl } from "@/lib/styleCover";

// The shot list (P5 — photography standard rollout).
//
// Deliberately not a grid of cards. A grid is for browsing, and nobody browses
// the work they still have to do — this gets read down, one line per garment,
// the way a call sheet is read. Each line says the same three things in the
// same three places: what it is, how far along it is, and what is missing.
//
// The dots are the whole idea. Five of them, always in standard order, so the
// same shot is in the same position on every line and the pattern down the
// column is visible without reading a word: if the fifth dot is empty on every
// row, the studio has a detail-shot problem, not thirty individual oversights.

type Slot = { id: string; label: string; hint?: string };

// Two views, not three (Tess, 2026-08-06: "remove complete"). Complete was a
// list of the styles there is nothing to do about, which is the one list a shot
// list does not need — and it made "All" look like a third thing rather than
// the whole. What is left is the work and everything. How much is finished is
// still on the bar above, as a number, where it belongs.
//
// filterRollout still understands "complete" and is still tested for it; it is
// simply not offered here. Nothing was deleted to make this change.
const VIEWS: { key: RolloutView; label: string }[] = [
  { key: "todo", label: "To shoot" },
  { key: "all", label: "All" },
];

function StatusBadge({ s }: { s?: string | null }) {
  const status = (s ?? "").toLowerCase();
  const cls = status === "development" ? "dev" : status === "production" ? "prod" : status || "inspo";
  return <span className={"badge " + cls}>{status === "development" ? "In development" : status || "—"}</span>;
}

function Row({ row }: { row: RolloutRow }) {
  const st = row.style;
  const thumb = styleCoverUrl(st);
  return (
    <div className={"ph-row" + (row.complete ? " done" : "")}>
      <Link href={`/styles/${st.id}#photography`} className="ph-thumb" title={st.name}>
        {/* The sketch, if there is one — on a shot list, the drawing is far
            more use than the reference photograph the style came from, because
            the drawing is what the shoot has to match. See lib/styleCover.ts. */}
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="ph-nothumb" />}
      </Link>

      <div className="ph-id">
        <Link href={`/styles/${st.id}#photography`} className="ph-name">
          {st.name}
        </Link>
        <div className="ph-sub">
          {[st.style_no, st.season].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      <div className="ph-status">
        <StatusBadge s={st.status} />
      </div>

      {/* Fixed order, one dot per slot — the column is the point. */}
      <div className="ph-dots">
        {row.slots.map((s) => (
          <span
            key={s.id}
            className={"ph-dot" + (s.shot ? " on" : "")}
            title={s.shot ? `${s.label} — shot` : `${s.label} — not shot`}
          />
        ))}
      </div>

      <div className="ph-need">
        <span className="ph-count">
          {row.filled}/{row.total}
        </span>
        {/* Titled as well as shown: the line is truncated on a narrow window
            and the missing shots are the one thing that must stay readable. */}
        <span
          className={"ph-needline" + (row.untouched ? " none" : "")}
          title={shotListLine(row)}
        >
          {shotListLine(row)}
        </span>
      </div>
    </div>
  );
}

export default function Photography({
  rows,
  summary,
  slots,
}: {
  rows: RolloutRow[];
  summary: RolloutSummary;
  slots: Slot[];
}) {
  const [view, setView] = useState<RolloutView>("todo");
  const shown = filterRollout(rows, view);
  const worst = worstSlot(summary);

  const counts: Record<RolloutView, number> = {
    todo: filterRollout(rows, "todo").length,
    complete: summary.complete,
    all: rows.length,
  };

  return (
    <>
      <div className="ph-summary">
        <div className="ph-figure">
          <div className="ph-pct">{summary.percent}%</div>
          <div className="ph-figsub">
            {summary.shotsDone} of {summary.shotsTotal} photographs
          </div>
          <div className="ph-bar">
            <span style={{ width: `${summary.percent}%` }} />
          </div>
        </div>

        {/* The other question: not which style is behind, but which shot is. */}
        <div className="ph-tally">
          {summary.bySlot.map((t) => (
            <div className="ph-tallyitem" key={t.id} title={slots.find((s) => s.id === t.id)?.hint}>
              <div className="ph-tallylabel">{t.label}</div>
              <div className="ph-tallyn">
                {t.missing === 0 ? "All shot" : `${t.missing} missing`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {worst && (
        <div className="tab-note">
          <strong>{worst.label}</strong> is the slot furthest behind — {worst.missing} of{" "}
          {summary.styles} styles are missing it. Worth a look at whether the shot is being asked
          for rather than chasing the styles one at a time.
        </div>
      )}

      <div className="tabs">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={"tab" + (view === v.key ? " active" : "")}
            onClick={() => setView(v.key)}
          >
            {v.label}
            <span className="n">{counts[v.key]}</span>
          </button>
        ))}
      </div>

      {view === "todo" && shown.length > 0 && (
        <div className="tab-note">
          Ordered for a shooting day: production first, then whatever is closest to finished.
          Archived styles are left out — they are under <strong>All</strong> if you want them.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          {view === "todo"
            ? rows.length === 0
              ? "No styles yet. Sample image slots appear here as soon as there are styles to shoot."
              : "Nothing left to shoot. Every style that isn't archived has all five slots."
            : "No styles yet."}
        </div>
      ) : (
        <div className="ph-list">
          {shown.map((r) => (
            <Row key={r.style.id} row={r} />
          ))}
        </div>
      )}
    </>
  );
}
