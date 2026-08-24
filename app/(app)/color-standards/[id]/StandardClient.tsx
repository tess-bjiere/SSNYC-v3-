"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Select from "@/app/components/Select";
import type { Material } from "@/app/(app)/materials/MaterialsClient";
// Both lib/materials.ts and lib/colorStandards.ts export a `specLine` — the
// material one is aliased so the two cannot collide (task-5 brief).
import { specLine as materialSpecLine } from "@/lib/materials";
import {
  specLine,
  rollup,
  approvalFor,
  APPROVAL_STATUSES,
  type ColorStandard,
  type Approval,
  type ApprovalStatus,
} from "@/lib/colorStandards";
import {
  updateStandard,
  saveApproval,
  dropApproval,
  addStandardImage,
  archiveStandard,
  softDeleteStandard,
} from "@/app/actions/colorStandards";

// The studio judges wherever the light is that day — lib/colorStandards.ts
// keeps `light` free text on purpose ("a dropdown would only get in the way").
// This is a datalist of what comes up often, not a closed set.
const LIGHT_SUGGESTIONS = ["Daylight", "Warm indoor", "D65", "TL84"];

// The editable copy of a standard's master fields — the same set the add-modal
// posts, just controlled here so Save is one button rather than one request per
// keystroke.
type Draft = {
  name: string;
  label: string;
  kind: "white" | "color" | "";
  pantone: string;
  hex: string;
  master_location: string;
  approved_on: string;
  approved_by: string;
  brightener: "yes" | "no" | "";
  spec: string;
  notes: string;
};

function toDraft(s: ColorStandard): Draft {
  return {
    name: s.name,
    label: s.label,
    kind: s.kind,
    pantone: s.pantone,
    hex: s.hex,
    master_location: s.master_location,
    approved_on: s.approved_on,
    approved_by: s.approved_by,
    brightener: s.brightener === true ? "yes" : s.brightener === false ? "no" : "",
    spec: s.spec,
    notes: s.notes,
  };
}

// One colour standard — the master on top, the approvals table below (Tess,
// 2026-08-23: "can you create a color standard that lives in the tool for
// fred?"). Mirrors material-orders' OrderClient: a page-level draft saved on a
// button, a table of lines each editable on its own, an add picker, a two-click
// remove.
export default function StandardClient({
  id,
  standard,
  materials,
}: {
  id: string;
  standard: ColorStandard;
  materials: Material[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => toDraft(standard));
  useEffect(() => setDraft(toDraft(standard)), [standard]);
  const [armRemove, setArmRemove] = useState(false);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const swatchInput = useRef<HTMLInputElement>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1600);
  }

  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const liveIds = useMemo(() => new Set(materials.map((m) => m.id)), [materials]);
  const counts = rollup(standard, liveIds);
  const archived = standard.archived;

  function save() {
    start(async () => {
      await updateStandard(id, draft);
      router.refresh();
      flash("Saved");
    });
  }
  function toggleArchive() {
    start(async () => {
      await archiveStandard(id, !archived);
      router.refresh();
      flash(archived ? "Unarchived" : "Archived");
    });
  }
  function remove() {
    start(async () => {
      await softDeleteStandard(id); // redirects to /color-standards
    });
  }
  async function uploadSwatch(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await addStandardImage(id, fd, "swatch");
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  // Structural changes to the approvals list — add or remove a material —
  // refresh so the rollup up top and the table stay in step. Per-field edits
  // inside a row (status, dates, notes) save fire-and-forget without a refresh,
  // the same trade OrderClient's LineRow makes: instant local feedback, and the
  // row's own state is already the source of truth for what it shows.
  function addMaterial(materialId: string) {
    start(async () => {
      setAdding(false);
      await saveApproval(id, materialId, {});
      router.refresh();
      flash("Added");
    });
  }
  function removeApproval(materialId: string) {
    start(async () => {
      await dropApproval(id, materialId);
      router.refresh();
      flash("Removed");
    });
  }

  // Rows resolve only against materials still live, per rollup()'s own rule —
  // an approval for a soft-deleted material is skipped here too, left in the
  // row on the server so restoring the material brings it straight back.
  const rows = useMemo(
    () =>
      standard.approvals
        .map((a) => ({ a, m: byId.get(a.material_id) }))
        .filter((x): x is { a: Approval; m: Material } => !!x.m),
    [standard.approvals, byId]
  );
  const pickable = useMemo(
    () => materials.filter((m) => !approvalFor(standard, m.id)),
    [materials, standard]
  );

  function swatch(size: "lg" | "sm") {
    const cls = "cs-swatch" + (size === "lg" ? " cs-swatch-lg" : "");
    if (standard.swatch_url) return <img className={cls} src={standard.swatch_url} alt="" />;
    if (standard.hex) return <span className={cls} style={{ background: standard.hex }} />;
    return <span className={cls + " cs-swatch-empty"} />;
  }

  return (
    <div className="page">
      <div className="page-head">
        {swatch("lg")}
        <div className="cs-head-body">
          <h1 className="page-title display">{standard.name}</h1>
          {specLine(standard) && <div className="cs-sub">{specLine(standard)}</div>}
        </div>
        <div className="spacer" />
        {archived && <span className="cs-archived-tag">Archived</span>}
      </div>

      {/* --- The master --- */}
      <section className="mat-form cs-master">
        <label className="mat-field">
          <span className="mat-label">Name</span>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>
        <label className="mat-field">
          <span className="mat-label">Label</span>
          <input
            className="input"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
        </label>
        <div className="mat-field">
          <span className="mat-label">White or colour</span>
          <div className="pg-filters" style={{ marginTop: 0 }}>
            {(["white", "color"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={"pg-filter" + (draft.kind === k ? " on" : "")}
                onClick={() => setDraft((d) => ({ ...d, kind: d.kind === k ? "" : k }))}
              >
                {k === "white" ? "White" : "Colour"}
              </button>
            ))}
          </div>
        </div>
        <label className="mat-field">
          <span className="mat-label">Pantone</span>
          <input
            className="input"
            value={draft.pantone}
            onChange={(e) => setDraft((d) => ({ ...d, pantone: e.target.value }))}
          />
        </label>
        <label className="mat-field">
          <span className="mat-label">Hex</span>
          <input
            className="input"
            value={draft.hex}
            placeholder="#RRGGBB"
            onChange={(e) => setDraft((d) => ({ ...d, hex: e.target.value }))}
          />
        </label>
        <label className="mat-field mat-field-wide">
          {/* "master_location is labelled ... so it reads as an instruction,
              not a database field" (task-5 brief). */}
          <span className="mat-label">Where the physical standard lives</span>
          <input
            className="input"
            value={draft.master_location}
            placeholder="e.g. Studio swatch binder, shelf 2"
            onChange={(e) => setDraft((d) => ({ ...d, master_location: e.target.value }))}
          />
        </label>
        <label className="mat-field">
          <span className="mat-label">Approved on</span>
          <input
            className="input"
            type="date"
            value={draft.approved_on}
            onChange={(e) => setDraft((d) => ({ ...d, approved_on: e.target.value }))}
          />
        </label>
        <label className="mat-field">
          <span className="mat-label">Approved by</span>
          <input
            className="input"
            value={draft.approved_by}
            onChange={(e) => setDraft((d) => ({ ...d, approved_by: e.target.value }))}
          />
        </label>
        <div className="mat-field">
          <span className="mat-label">Optical brightener</span>
          <div className="pg-filters" style={{ marginTop: 0 }}>
            {([
              ["yes", "Yes"],
              ["no", "No"],
              ["", "Unknown"],
            ] as const).map(([v, l]) => (
              <button
                key={v || "unknown"}
                type="button"
                className={"pg-filter" + (draft.brightener === v ? " on" : "")}
                onClick={() => setDraft((d) => ({ ...d, brightener: v }))}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="mat-field mat-field-wide">
          <span className="mat-label">Spec</span>
          <textarea
            className="textarea"
            rows={2}
            value={draft.spec}
            onChange={(e) => setDraft((d) => ({ ...d, spec: e.target.value }))}
          />
        </label>
        <label className="mat-field mat-field-wide">
          <span className="mat-label">Notes</span>
          <textarea
            className="textarea"
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />
        </label>

        <input
          ref={swatchInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (f) uploadSwatch(f);
          }}
        />

        <div className="mat-tools">
          <button type="button" className="btn" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={uploading}
            onClick={() => swatchInput.current?.click()}
          >
            {uploading ? "Uploading…" : "+ Swatch photo"}
          </button>
          <button type="button" className="btn ghost sm" disabled={pending} onClick={toggleArchive}>
            {archived ? "Unarchive" : "Archive"}
          </button>
          <span className="spacer" />
          <button
            type="button"
            className={"btn link" + (armRemove ? " arm" : "")}
            disabled={pending}
            onMouseLeave={() => setArmRemove(false)}
            onClick={() => (armRemove ? remove() : setArmRemove(true))}
          >
            {armRemove ? "Remove?" : "Remove"}
          </button>
        </div>
      </section>

      {/* --- The approvals table --- */}
      <section className="cs-approvals">
        <div className="cs-approvals-head">
          <h2>Approvals</h2>
          <span className="cs-approvals-n">
            {counts.total === 0
              ? "No materials linked"
              : `${counts.approved} approved · ${counts.pending} pending${
                  counts.rejected ? ` · ${counts.rejected} rejected` : ""
                }`}
          </span>
          <div className="spacer" />
          <button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>
            + Add material
          </button>
        </div>

        <datalist id="cs-light-suggestions">
          {LIGHT_SUGGESTIONS.map((l) => (
            <option value={l} key={l} />
          ))}
        </datalist>

        {rows.length === 0 ? (
          <div className="empty">
            No materials approved against this standard yet. Use “+ Add material”.
          </div>
        ) : (
          <div className="cs-table">
            <div className="cs-row cs-row-head">
              <span>Material</span>
              <span>Status</span>
              <span>Judged on</span>
              <span>Judged by</span>
              <span>Light</span>
              <span>Note</span>
              <span />
            </div>
            {rows.map(({ a, m }) => (
              <ApprovalRow
                key={m.id}
                standardId={id}
                material={m}
                approval={a}
                onRemove={() => removeApproval(m.id)}
              />
            ))}
          </div>
        )}
      </section>

      {adding && (
        <AddMaterial pickable={pickable} onClose={() => setAdding(false)} onAdd={addMaterial} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// One approval row. Status/date/who/light/note each save on their own — status
// on change, everything else on blur — the same idiom as OrderClient's LineRow.
// A two-click remove calls dropApproval.
function ApprovalRow({
  standardId,
  material,
  approval,
  onRemove,
}: {
  standardId: string;
  material: Material;
  approval: Approval;
  onRemove: () => void;
}) {
  const [status, setStatus] = useState<ApprovalStatus>(approval.status);
  const [judgedOn, setJudgedOn] = useState(approval.judged_on ?? "");
  const [judgedBy, setJudgedBy] = useState(approval.judged_by ?? "");
  const [light, setLight] = useState(approval.light ?? "");
  const [note, setNote] = useState(approval.note ?? "");
  const [arm, setArm] = useState(false);
  useEffect(() => setStatus(approval.status), [approval.status]);
  useEffect(() => setJudgedOn(approval.judged_on ?? ""), [approval.judged_on]);
  useEffect(() => setJudgedBy(approval.judged_by ?? ""), [approval.judged_by]);
  useEffect(() => setLight(approval.light ?? ""), [approval.light]);
  useEffect(() => setNote(approval.note ?? ""), [approval.note]);

  function save(patch: Partial<Omit<Approval, "material_id">>) {
    saveApproval(standardId, material.id, patch);
  }

  return (
    <div className="cs-row">
      <div className="cs-row-mat">
        <span className="cs-mat-name">{material.name}</span>
        <span className="cs-mat-spec">{materialSpecLine(material)}</span>
      </div>
      <Select
        className="select sm"
        aria-label={`Status — ${material.name}`}
        value={status}
        onChange={(v) => {
          const s = v as ApprovalStatus;
          setStatus(s);
          save({ status: s });
        }}
        options={APPROVAL_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
      />
      <input
        className="input sm"
        type="date"
        aria-label={`Judged on — ${material.name}`}
        value={judgedOn}
        onChange={(e) => setJudgedOn(e.target.value)}
        onBlur={() => judgedOn !== (approval.judged_on ?? "") && save({ judged_on: judgedOn })}
      />
      <input
        className="input sm"
        placeholder="—"
        aria-label={`Judged by — ${material.name}`}
        value={judgedBy}
        onChange={(e) => setJudgedBy(e.target.value)}
        onBlur={() => judgedBy !== (approval.judged_by ?? "") && save({ judged_by: judgedBy })}
      />
      <input
        className="input sm"
        placeholder="—"
        list="cs-light-suggestions"
        aria-label={`Light — ${material.name}`}
        value={light}
        onChange={(e) => setLight(e.target.value)}
        onBlur={() => light !== (approval.light ?? "") && save({ light })}
      />
      <input
        className="input sm"
        placeholder="—"
        aria-label={`Note — ${material.name}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (approval.note ?? "") && save({ note })}
      />
      <button
        type="button"
        className={"btn link sm" + (arm ? " arm" : "")}
        title="Remove"
        onMouseLeave={() => setArm(false)}
        onClick={() => (arm ? onRemove() : setArm(true))}
      >
        {arm ? "Remove?" : "✕"}
      </button>
    </div>
  );
}

// The add-material picker — every material in the brand not already approved
// against this standard, searchable. Modelled on OrderClient's AddMaterials,
// cut down to a single click per add rather than a batch-and-confirm, since
// saveApproval takes one material at a time.
function AddMaterial({
  pickable,
  onClose,
  onAdd,
}: {
  pickable: Material[];
  onClose: () => void;
  onAdd: (materialId: string) => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return pickable;
    return pickable.filter((m) =>
      `${m.name} ${m.supplier ?? ""} ${materialSpecLine(m)}`.toLowerCase().includes(query)
    );
  }, [pickable, q]);

  return (
    <div className="modal-overlay">
      <div className="modal mat-modal">
        <div className="modal-head">
          <span>Add material</span>
          <button className="notes-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <input
            className="input mo-pick-search"
            placeholder="Search materials — name, composition, supplier…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
          {shown.length === 0 ? (
            <div className="empty">
              {pickable.length === 0 ? "Every material is already linked." : "No materials match."}
            </div>
          ) : (
            <div className="mo-pick-list">
              {shown.map((m) => (
                <button key={m.id} type="button" className="mo-pick" onClick={() => onAdd(m.id)}>
                  <span className="mo-pick-body">
                    <span className="mo-pick-name">{m.name}</span>
                    <span className="mo-pick-spec">{materialSpecLine(m) || m.supplier}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
