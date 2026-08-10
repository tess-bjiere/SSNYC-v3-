"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SAMPLE_ROUND_LABELS, type SampleRound, type Style, type StyleSample } from "@/lib/types";
import { SAMPLE_STATE_LABELS, materialStatus, sampleState, shortDate } from "@/lib/sampleCycle";
import {
  factoryKey,
  factoryStats,
  orderRows,
  UNASSIGNED,
  type FactoryGroup,
  type FactoryRowView,
} from "@/lib/factories";

// The by-factory view, rebuilt (Tess, 2026-08-07: "this isnt clear what dates
// they are sharing. What would be the most improtant quick view info for a
// manager to see when trying to understand what is happening at an individual
// factory -- quality, timelines, where they are in the sample process and
// overall logical alignemnt of information").
//
// The old row printed SENT and BACK as two small-caps labels floating at the
// right-hand end with nothing saying which round they belonged to. She is right
// that it is unreadable: on a style with four rounds behind it, two bare dates
// are a riddle, and the row beneath might be quoting a different leg entirely.
//
// What replaced it is one sentence per row, in one place, that names its own
// round: "2nd Proto — sent 19 Aug, back 28 Aug · 9 days". Nothing to align
// across, nothing to infer.
//
// And the rows are grouped by what can be DONE about them rather than listed
// flat, because that is the actual shape of the question. A factory page gets
// opened for one of three reasons and they do not mix:
//
//   With them now  — the only part still in play. Longest out at the top,
//                    because that is the one to ask about first.
//   Back with us   — the record. Most recent first, to check an answer against.
//   Not sent       — a studio to-do wearing a factory's name.
//
// Timelines are shown as durations, not as dates to subtract in your head:
// days out for what is open, days taken for what is closed, and both compared
// against this factory's own average rather than a studio-wide idea of normal.
// A knit factory and a cut-and-sew factory are not late at the same number.

type Group = FactoryGroup<Style, StyleSample>;
type Row = FactoryRowView<Style, StyleSample>;

function Dot({ rating }: { rating: string }) {
  if (!rating) return null;
  return (
    <span
      className={"sib-dot " + rating}
      title={`Last judged round came back ${rating}`}
      aria-label={`Last judged round rated ${rating}`}
    />
  );
}

/**
 * One style at one factory.
 *
 * The dates line is the whole point of the rewrite, so it is one string and it
 * leads with the round it belongs to. Everything after it is a duration,
 * because "9 days" is a fact somebody can hold a factory to and "19 Aug → 28
 * Aug" is arithmetic homework.
 */
function StyleRow({ row, today, archived = false }: { row: Row; today: string; archived?: boolean }) {
  const open = row.open;
  const label = open ? SAMPLE_ROUND_LABELS[open.round as SampleRound] ?? open.round : "";
  const state = open ? sampleState(open) : null;
  const mat = open ? materialStatus(open, today) : null;


  return (
    <div className={"fx-row" + (archived ? " archived" : "") + (row.late && !archived ? " late" : "")}>
      <div className="fx-name">
        <span className="fx-nameline">
          <Dot rating={row.rating} />
          <Link href={`/styles/${row.style.id}`}>{row.style.name}</Link>
        </span>
        <span className="fx-sub">
          {row.style.style_no && <span className="fx-no">{row.style.style_no}</span>}
          {/* How many rounds this factory has run of this style. A third proto
              here is a different story from a third proto that arrived after
              two at somebody else's, and the number is the only thing on the
              row that says which. */}
          {row.roundsHere > 1 && <span className="fx-rounds">{row.roundsHere} rounds here</span>}
        </span>
      </div>

      <div className="fx-where">
        {/* Where it is in the sample process, said as the round's own name. */}
        <span className="fx-round">{label || "—"}</span>
        {state && !archived && row.phase !== "back" && (
          <span className={"sr-state " + state}>{SAMPLE_STATE_LABELS[state]}</span>
        )}
      </div>

      {/* Both dates labelled in full (Tess, 2026-08-07: "sample requested: 19
          Aug 26   sample received: 28 Aug 26").

          "Sent" and "back" were shorter and that was the problem — they read as
          column headings that had drifted, and neither said what had been sent
          or what had come back. Naming the thing costs a few characters and
          removes the question entirely.

          The round name is NOT repeated here (Tess, 2026-08-07: "dont list 2nd
          proto twice"). It was printed once as the process column and again as
          the lead of this line, on the argument that the dates should name
          their own round — but the two sit side by side in the same row, so the
          second one was answering a question the first had already answered a
          centimetre to its left. Said once, in the column whose job it is.

          A date that has not happened yet is an em dash rather than a missing
          label. A row where the second pair simply vanishes reads as a row
          somebody forgot to fill in. */}
      <div className="fx-when">
        {open ? (
          <>
            <span className="fx-when-pair">
              <span className="l">sample requested:</span> {shortDate(open.submitted_date) || "—"}
            </span>
            <span className="fx-when-pair">
              <span className="l">sample received:</span> {shortDate(open.received_date) || "—"}
            </span>
          </>
        ) : (
          <span className="fx-when-pair">
            <span className="l">sample requested:</span> —
          </span>
        )}
      </div>

      <div className="fx-dur">
        {row.phase === "with_them" && row.daysOut !== null && (
          <span className={"fx-days" + (row.late && !archived ? " late" : "")}>
            {row.daysOut}d out
          </span>
        )}
        {row.phase === "back" && row.turnaround !== null && (
          <span className="fx-days done">{row.turnaround}d round trip</span>
        )}
        {!archived && mat && mat.state !== "none" && (
          <span className={"fx-matlabel " + mat.state}>{mat.label}</span>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  rows,
  today,
  archived = false,
}: {
  title: string;
  note?: string;
  rows: Row[];
  today: string;
  archived?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <div className="fx-sec">
      <div className="fx-sec-head">
        {title}
        <span className="c">{rows.length}</span>
        {note && <span className="fx-sec-note">{note}</span>}
      </div>
      <div className="fx-rows">
        {rows.map((r) => (
          <StyleRow key={r.style.id} row={r} today={today} archived={archived} />
        ))}
      </div>
    </div>
  );
}

export default function Factories({ groups, today }: { groups: Group[]; today: string }) {
  const [picked, setPicked] = useState(groups[0]?.key ?? "");
  const group = groups.find((g) => g.key === picked) ?? groups[0] ?? null;

  const stats = useMemo(() => (group ? factoryStats(group, today) : null), [group, today]);
  const rows = useMemo(
    () => (group && stats ? orderRows(group.styles, today, stats.avgTurnaround) : []),
    [group, stats, today]
  );
  const archivedRows = useMemo(
    () => (group ? orderRows(group.archived, today, null) : []),
    [group, today]
  );

  if (!group || !stats) {
    return (
      <div className="empty">
        No sample rounds logged yet. Add a round on a style and its factory appears here.
      </div>
    );
  }

  const unassigned = group.key === factoryKey(UNASSIGNED);

  return (
    <div className="fx">
      <div className="fx-tabs">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            className={"fx-tab" + (g.key === group.key ? " active" : "")}
            onClick={() => setPicked(g.key)}
          >
            <span className="n">{g.name}</span>
            <span className="c">
              {g.styles.length} {g.styles.length === 1 ? "style" : "styles"}
              {g.openCount > 0 && ` · ${g.openCount} out`}
            </span>
          </button>
        ))}
      </div>

      <div className="fx-panel">
        <div className="fx-panel-head">
          <h3>{group.name}</h3>
        </div>

        {/* The four numbers a manager wants before saying a word: how much they
            are holding, how long they take, how many are past that, and what
            the work is like when it arrives. Anything that is zero is left out
            — a row of zeroes is a row you learn to skip. */}
        {!unassigned && (
          <div className="fx-stats">
            <div className="fx-stat">
              <span className="v">{stats.withThem}</span>
              <span className="k">with them now</span>
            </div>
            <div className="fx-stat">
              <span className="v">
                {stats.avgTurnaround === null ? "—" : `${stats.avgTurnaround}d`}
              </span>
              <span className="k">
                {stats.avgTurnaround === null
                  ? "not enough finished rounds"
                  : `average round trip · ${stats.measured} rounds`}
              </span>
            </div>
            {stats.overdue > 0 && (
              <div className="fx-stat">
                <span className="v late">{stats.overdue}</span>
                <span className="k">past their own average</span>
              </div>
            )}
            <div className="fx-stat">
              <span className="v quality">
                {/* Quality as a mix, not a score. "Mostly workable" is a
                    different factory from "half good, half poor", and one
                    number would flatten them into each other. */}
                {stats.good > 0 && (
                  <span className="q">
                    <span className="sib-dot good" /> {stats.good}
                  </span>
                )}
                {stats.workable > 0 && (
                  <span className="q">
                    <span className="sib-dot workable" /> {stats.workable}
                  </span>
                )}
                {stats.poor > 0 && (
                  <span className="q">
                    <span className="sib-dot poor" /> {stats.poor}
                  </span>
                )}
                {stats.good + stats.workable + stats.poor === 0 && "—"}
              </span>
              <span className="k">
                {stats.unrated > 0 ? `rated · ${stats.unrated} unrated` : "rated"}
              </span>
            </div>
          </div>
        )}

        {unassigned && <p className="fx-none">No factory set on these rounds.</p>}

        <Section
          title="With them now"
          note={
            stats.avgTurnaround === null
              ? undefined
              : `late is measured against their own ${stats.avgTurnaround}-day average`
          }
          rows={rows.filter((r) => r.phase === "with_them")}
          today={today}
        />
        <Section title="Back with us" rows={rows.filter((r) => r.phase === "back")} today={today} />
        <Section
          title="Not sent"
          note="logged here but never shipped"
          rows={rows.filter((r) => r.phase === "not_sent")}
          today={today}
        />

        {/* Still shown — the factory physically has the sample and somebody has
            to decide what happens to it — but out of the counts and out of the
            work. */}
        <Section title="Archived" rows={archivedRows} today={today} archived />

        {rows.length === 0 && archivedRows.length === 0 && (
          <div className="fx-none">Nothing live here.</div>
        )}

        <div className="sr-today">Today {shortDate(today)}</div>
      </div>
    </div>
  );
}
