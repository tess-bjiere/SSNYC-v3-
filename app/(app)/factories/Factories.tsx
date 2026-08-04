"use client";

import { useState } from "react";
import Link from "next/link";
import { SAMPLE_ROUND_LABELS, type SampleRound, type Style, type StyleSample } from "@/lib/types";
import { sampleState, SAMPLE_STATE_LABELS, materialStatus, daysBetween, shortDate } from "@/lib/sampleCycle";
import { factoryKey, UNASSIGNED, type FactoryGroup } from "@/lib/factories";

// The by-factory view (P3 #41).
//
// Read down a column instead of across a style: pick a factory and see
// everything it has of ours, what round each style is on, when it went out and
// whether it is back. This is the view for the call with the factory, so the
// three things that get asked are the three things on the row — round, sent,
// back — and anything late is the only thing that gets a colour.
//
// `today` comes from the server so the "days out" arithmetic is decided once and
// cannot drift between server and client render.

type Group = FactoryGroup<Style, StyleSample>;

function Row({ style, open, today }: { style: Style; open: StyleSample | null; today: string }) {
  const state = open ? sampleState(open) : null;
  const mat = open ? materialStatus(open, today) : null;
  // How long the factory has had it. Only meaningful while it is actually out.
  const out = state === "at_factory" ? daysBetween(open?.submitted_date, today) : null;

  return (
    <div className="fx-row">
      <div className="fx-name">
        <Link href={`/styles/${style.id}`}>{style.name}</Link>
        {style.style_no && <span className="fx-no">{style.style_no}</span>}
      </div>

      <div className="fx-round">
        {open ? SAMPLE_ROUND_LABELS[open.round as SampleRound] ?? open.round : "—"}
        {state && <span className={"sr-state " + state}>{SAMPLE_STATE_LABELS[state]}</span>}
      </div>

      <div className="fx-dates">
        {open?.submitted_date ? (
          <span>
            <span className="k">Sent</span> {shortDate(open.submitted_date)}
          </span>
        ) : (
          <span className="dim">Not sent</span>
        )}
        {open?.received_date && (
          <span>
            <span className="k">Back</span> {shortDate(open.received_date)}
          </span>
        )}
        {out !== null && out >= 0 && <span className="fx-out">{out}d out</span>}
      </div>

      <div className="fx-mat">
        {mat && mat.state !== "none" && <span className={"fx-matlabel " + mat.state}>{mat.label}</span>}
      </div>
    </div>
  );
}

export default function Factories({ groups, today }: { groups: Group[]; today: string }) {
  const [picked, setPicked] = useState(groups[0]?.key ?? "");
  const group = groups.find((g) => g.key === picked) ?? groups[0] ?? null;

  if (!group) {
    return (
      <div className="empty">
        No sample rounds logged yet. Add a round on a style and its factory appears here.
      </div>
    );
  }

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
          <span className="count">
            {group.key === factoryKey(UNASSIGNED)
              ? "No factory set on these rounds"
              : group.openCount > 0
                ? `${group.openCount} round${group.openCount === 1 ? "" : "s"} with them now`
                : "Nothing out with them"}
          </span>
        </div>

        <div className="fx-rows">
          {group.styles.map((row) => (
            <Row key={row.style.id} style={row.style} open={row.open} today={today} />
          ))}
        </div>

        <div className="sr-today">Today {shortDate(today)}</div>
      </div>
    </div>
  );
}
