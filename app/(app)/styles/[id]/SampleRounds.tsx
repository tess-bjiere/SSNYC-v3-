"use client";

import { useState } from "react";
import { SAMPLE_ROUNDS, SAMPLE_ROUND_LABELS, type SampleRound, type StyleSample } from "@/lib/types";
import {
  sampleState,
  SAMPLE_STATE_LABELS,
  materialStatus,
  materialLeadDays,
  factoryLeadDays,
  sampleTimeline,
  shortDate,
  sortSamples,
} from "@/lib/sampleCycle";
import { addSample, updateSample } from "@/app/actions/styles";

// The sample cycle (P3 #40).
//
// A round used to be one line: round, factory, two dates. That hid the thing
// that actually costs the season — the raw material leg. Fabric is ordered,
// has an ETA, lands at the factory, and only then does the factory leg start.
// A round that was late because the fabric was late looked identical to a round
// the factory sat on.
//
// So each round now reads as a small timeline with the material leg in front of
// the factory leg, a single state word, and the two lead times side by side once
// they exist. Everything shown here is computed in lib/sampleCycle.ts, which is
// pure and unit-tested — this file only lays it out.
//
// `today` is passed down from the server so the "late" arithmetic is decided
// once, server-side, and the markup can't drift between server and client.

function Field({
  label,
  name,
  defaultValue,
  type,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}

function RoundCard({
  styleId,
  s,
  today,
}: {
  styleId: string;
  s: StyleSample;
  today: string;
}) {
  const [open, setOpen] = useState(false);

  const state = sampleState(s);
  const mat = materialStatus(s, today);
  const steps = sampleTimeline(s);
  const matLead = materialLeadDays(s);
  const facLead = factoryLeadDays(s);

  return (
    <div className={"sr-card " + state}>
      <div className="sr-head">
        <strong>{SAMPLE_ROUND_LABELS[s.round as SampleRound] ?? s.round}</strong>
        <span className={"sr-state " + state}>{SAMPLE_STATE_LABELS[state]}</span>
        {s.factory && <span className="sr-factory">{s.factory}</span>}
        <button type="button" className="btn ghost sm sr-edit" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {mat.state !== "none" && <div className={"sr-material " + mat.state}>{mat.label}</div>}

      {steps.length > 0 && (
        <div className="sr-timeline">
          {steps.map((st) => (
            <span className="sr-step" key={st.key}>
              <span className="l">{st.label}</span>
              <span className="d">{st.date}</span>
            </span>
          ))}
        </div>
      )}

      {(matLead !== null || facLead !== null) && (
        <div className="sr-lead">
          {matLead !== null && <span>Material leg {matLead}d</span>}
          {facLead !== null && <span>Factory leg {facLead}d</span>}
        </div>
      )}

      {s.status && <div className="sr-status">{s.status}</div>}
      {s.fit_notes && (
        <div className="sr-note">
          <span className="k">Fit</span>
          {s.fit_notes}
        </div>
      )}
      {s.comments && (
        <div className="sr-note">
          <span className="k">Factory</span>
          {s.comments}
        </div>
      )}

      {open && (
        <form className="sr-form" action={updateSample.bind(null, styleId, s.id)}>
          <div className="row3">
            <div className="field">
              <label>Round</label>
              <select className="select" name="round" defaultValue={s.round}>
                {SAMPLE_ROUNDS.map((r) => (
                  <option key={r} value={r}>
                    {SAMPLE_ROUND_LABELS[r]}
                  </option>
                ))}
                {!SAMPLE_ROUNDS.includes(s.round as SampleRound) && <option value={s.round}>{s.round}</option>}
              </select>
            </div>
            <Field label="Factory" name="factory" defaultValue={s.factory ?? ""} />
            <Field label="Status" name="status" defaultValue={s.status ?? ""} placeholder="e.g. fit ok" />
          </div>

          <div className="sr-legend">Raw material</div>
          <div className="row3">
            <Field label="Supplier" name="material_supplier" defaultValue={s.material_supplier ?? ""} />
            <Field label="Ordered" name="material_ordered_date" type="date" defaultValue={s.material_ordered_date ?? ""} />
            <Field label="ETA" name="material_eta_date" type="date" defaultValue={s.material_eta_date ?? ""} />
          </div>
          <div className="row">
            <Field
              label="Material in"
              name="material_received_date"
              type="date"
              defaultValue={s.material_received_date ?? ""}
            />
            <div className="field" />
          </div>

          <div className="sr-legend">Factory</div>
          <div className="row">
            <Field label="Submitted" name="submitted_date" type="date" defaultValue={s.submitted_date ?? ""} />
            <Field label="Received" name="received_date" type="date" defaultValue={s.received_date ?? ""} />
          </div>

          <div className="field">
            <label>Fit notes — how this round fitted</label>
            <textarea className="textarea" name="fit_notes" defaultValue={s.fit_notes ?? ""} />
          </div>
          <div className="field">
            <label>Factory comments — what was said about this submission</label>
            <textarea className="textarea" name="comments" defaultValue={s.comments ?? ""} />
          </div>

          <button className="btn sm" type="submit">
            Save round
          </button>
        </form>
      )}
    </div>
  );
}

export default function SampleRounds({
  styleId,
  samples,
  defaultFactory,
  today,
}: {
  styleId: string;
  samples: StyleSample[];
  defaultFactory: string;
  today: string;
}) {
  const [adding, setAdding] = useState(false);

  // Cycle order, not insertion order. Rounds logged in one sitting share a
  // created_at, and the order Postgres returns for tied rows shifts the moment
  // one of them is edited — the season visibly re-shuffled after a save.
  const rounds = sortSamples(samples, SAMPLE_ROUNDS);

  return (
    <div className="section">
      <h3>Sample cycle</h3>

      {rounds.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>No sample rounds logged yet.</div>
      ) : (
        rounds.map((s) => <RoundCard key={s.id} styleId={styleId} s={s} today={today} />)
      )}

      {adding ? (
        <form className="sr-form add" action={addSample.bind(null, styleId)}>
          <div className="row3">
            <div className="field">
              <label>Round</label>
              <select className="select" name="round" required defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {SAMPLE_ROUNDS.map((r) => (
                  <option key={r} value={r}>
                    {SAMPLE_ROUND_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Factory" name="factory" defaultValue={defaultFactory} />
            <Field label="Status" name="status" placeholder="e.g. fit ok" />
          </div>

          <div className="sr-legend">Raw material</div>
          <div className="row3">
            <Field label="Supplier" name="material_supplier" />
            <Field label="Ordered" name="material_ordered_date" type="date" />
            <Field label="ETA" name="material_eta_date" type="date" />
          </div>
          <div className="row">
            <Field label="Material in" name="material_received_date" type="date" />
            <div className="field" />
          </div>

          <div className="sr-legend">Factory</div>
          <div className="row">
            <Field label="Submitted" name="submitted_date" type="date" />
            <Field label="Received" name="received_date" type="date" />
          </div>

          <div className="field">
            <label>Fit notes</label>
            <textarea className="textarea" name="fit_notes" />
          </div>
          <div className="field">
            <label>Factory comments</label>
            <textarea className="textarea" name="comments" />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm" type="submit">
              Add sample round
            </button>
            <button className="btn ghost sm" type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn ghost sm" type="button" style={{ marginTop: 6 }} onClick={() => setAdding(true)}>
          Add sample round
        </button>
      )}

      <div className="sr-today">Today {shortDate(today)}</div>
    </div>
  );
}
