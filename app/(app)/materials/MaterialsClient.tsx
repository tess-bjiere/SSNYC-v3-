"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Select from "@/app/components/Select";
import {
  fieldsFor,
  specLine,
  matchMaterial,
  distinct,
  kindLabel,
  type MaterialKind,
} from "@/lib/materials";
import {
  createMaterial,
  updateMaterial,
  addMaterialImages,
  softDeleteMaterial,
} from "@/app/actions/materials";

export type Material = {
  id: string;
  brand: string;
  kind: string;
  name: string;
  supplier: string | null;
  supplier_ref: string | null;
  composition: string | null;
  color: string | null;
  color_hex: string | null;
  weight: string | null;
  width: string | null;
  construction: string | null;
  finish: string | null;
  trim_type: string | null;
  size: string | null;
  material: string | null;
  price: string | null;
  moq: string | null;
  lead_time: string | null;
  notes: string | null;
  image_url: string | null;
  thumb_url: string | null;
  extra_images: unknown;
};

function cover(m: Material): string {
  return m.thumb_url || m.image_url || "";
}
function extraUrls(m: Material): string[] {
  const a = m.extra_images;
  if (!Array.isArray(a)) return [];
  return a
    .map((e) => (typeof e === "string" ? e : e && typeof e === "object" ? (e as { image_url?: string }).image_url ?? "" : ""))
    .filter(Boolean);
}

// The fabric & trim library (Tess, 2026-08-18). A grid of swatch cards, told
// apart by kind, with search, a supplier filter, add and edit. Modelled on the
// References library; a material's fields are its spec, not a garment's.
export default function MaterialsClient({
  materials,
  canEdit = false,
}: {
  materials: Material[];
  canEdit?: boolean;
}) {
  const [kind, setKind] = useState<MaterialKind>("fabric");
  const [q, setQ] = useState("");
  const [supplier, setSupplier] = useState("");
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Material | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  const ofKind = useMemo(
    () => materials.filter((m) => (m.kind === "trim" ? "trim" : "fabric") === kind),
    [materials, kind]
  );
  const suppliers = useMemo(() => distinct(ofKind, "supplier"), [ofKind]);
  const shown = useMemo(
    () => ofKind.filter((m) => matchMaterial(m, q) && (!supplier || (m.supplier ?? "") === supplier)),
    [ofKind, q, supplier]
  );

  return (
    <div className="page lib-page">
      <div className="page-head">
        <h1 className="page-title display">Fabrics &amp; Trims</h1>
        <div className="spacer" />
        {canEdit && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Add {kindLabel(kind).toLowerCase()}
          </button>
        )}
      </div>

      {/* Fabric / Trim — two libraries in one, told apart by kind. */}
      <div className="pg-filters">
        {(["fabric", "trim"] as MaterialKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className={"pg-filter" + (kind === k ? " on" : "")}
            aria-pressed={kind === k}
            onClick={() => { setKind(k); setSupplier(""); }}
          >
            {kindLabel(k)}s
          </button>
        ))}
      </div>

      <div className="lib-bar">
        <input
          className="input lib-search"
          placeholder={`Search ${kindLabel(kind).toLowerCase()}s — name, composition, supplier…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {suppliers.length > 0 && (
          <Select
            className="select sm lib-sort"
            aria-label="Supplier"
            value={supplier}
            onChange={setSupplier}
            options={[{ value: "", label: "All suppliers" }, ...suppliers.map((s) => ({ value: s, label: s }))]}
          />
        )}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          {ofKind.length === 0
            ? `No ${kindLabel(kind).toLowerCase()}s yet.${canEdit ? ` Add one with the button above.` : ""}`
            : `No ${kindLabel(kind).toLowerCase()}s match those filters.`}
        </div>
      ) : (
        <div className="grid dens-md">
          {shown.map((m) => {
            const src = cover(m);
            const n = extraUrls(m).length + (src ? 1 : 0);
            return (
              <div className="card lib-card" key={m.id} onClick={() => setDetail(m)}>
                <div className="imgwrap">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={m.name} loading="lazy" />
                  ) : (
                    <div className="mat-noimg">
                      {m.color_hex && <span className="mat-chip" style={{ background: m.color_hex }} />}
                      No swatch
                    </div>
                  )}
                  {n > 1 && <span className="card-extra">{n}</span>}
                </div>
                <div className="meta">
                  <div className="d">{m.name}</div>
                  {specLine(m) && <div className="s">{specLine(m)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <MaterialForm
          kind={kind}
          onClose={() => setAdding(false)}
          onDone={(k) => { setAdding(false); flash(`Added ${kindLabel(k).toLowerCase()}`); }}
        />
      )}

      {detail && (
        <MaterialDetail
          material={detail}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onToast={flash}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// The add form — a new fabric or trim, with its kind-appropriate fields and one
// or more swatch photos.
function MaterialForm({
  kind,
  onClose,
  onDone,
}: {
  kind: MaterialKind;
  onClose: () => void;
  onDone: (k: MaterialKind) => void;
}) {
  const router = useRouter();
  const [k, setK] = useState<MaterialKind>(kind);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    fd.set("kind", k);
    setBusy(true);
    setErr(null);
    try {
      const res = await createMaterial(fd);
      if (res.ok) {
        router.refresh();
        onDone(k);
      } else {
        setErr(res.errors[0] ?? "Could not save.");
      }
    } catch {
      setErr("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal mat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Add {kindLabel(k).toLowerCase()}</span>
          <button className="notes-close" onClick={onClose} title="Close">×</button>
        </div>
        <form ref={formRef} className="modal-body mat-form" onSubmit={submit}>
          <div className="pg-filters" style={{ marginTop: 0 }}>
            {(["fabric", "trim"] as MaterialKind[]).map((kk) => (
              <button
                key={kk}
                type="button"
                className={"pg-filter" + (k === kk ? " on" : "")}
                onClick={() => setK(kk)}
              >
                {kindLabel(kk)}
              </button>
            ))}
          </div>

          <label className="mat-field">
            <span className="mat-label">Name *</span>
            <input className="input" name="name" required autoFocus />
          </label>

          {fieldsFor(k).map((f) => (
            <label className="mat-field" key={f.key}>
              <span className="mat-label">{f.label}</span>
              <input className="input" name={f.key} />
            </label>
          ))}

          <label className="mat-field mat-field-wide">
            <span className="mat-label">Notes</span>
            <textarea className="textarea" name="notes" rows={2} />
          </label>

          <label className="mat-field mat-field-wide">
            <span className="mat-label">Swatch images</span>
            <input className="input" type="file" name="files" accept="image/*" multiple />
          </label>

          {err && <div className="mat-err">{err}</div>}

          <div className="mat-tools">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="ph-link" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// The detail view — the swatch(es), the full spec as an inline editor for the
// team, add-more-images, and a two-click remove.
function MaterialDetail({
  material,
  canEdit,
  onClose,
  onToast,
}: {
  material: Material;
  canEdit: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const k: MaterialKind = material.kind === "trim" ? "trim" : "fabric";
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = { name: material.name ?? "" };
    for (const f of fieldsFor(k)) d[f.key] = (material[f.key as keyof Material] as string | null) ?? "";
    d.notes = material.notes ?? "";
    return d;
  });
  const [arm, setArm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);

  const images = [cover(material), ...extraUrls(material)].filter(Boolean);

  function save() {
    if (!canEdit) return;
    start(async () => {
      await updateMaterial(material.id, draft);
      router.refresh();
      onToast("Saved");
    });
  }
  async function addImages(list: FileList | null) {
    if (!canEdit) return;
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    setUploading(true);
    try {
      const res = await addMaterialImages(material.id, fd);
      if (res.ok) { router.refresh(); onToast("Images added"); onClose(); }
      else if (res.errors[0]) onToast(res.errors[0]);
    } finally {
      setUploading(false);
    }
  }
  function remove() {
    start(async () => {
      await softDeleteMaterial(material.id);
      router.refresh();
      onToast("Moved to Trash");
      onClose();
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal mat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{material.name} · {kindLabel(k)}</span>
          <button className="notes-close" onClick={onClose} title="Close">×</button>
        </div>
        <div className="modal-body">
          {images.length > 0 && (
            <div className="grid dens-md mat-images">
              {images.map((src, i) => (
                <div className="card lib-card" key={i}>
                  <div className="imgwrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={material.name} loading="lazy" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {canEdit ? (
            <div className="mat-form">
              <label className="mat-field">
                <span className="mat-label">Name</span>
                <input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </label>
              {fieldsFor(k).map((f) => (
                <label className="mat-field" key={f.key}>
                  <span className="mat-label">{f.label}</span>
                  <input
                    className="input"
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="mat-field mat-field-wide">
                <span className="mat-label">Notes</span>
                <textarea
                  className="textarea"
                  rows={2}
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>

              <input ref={imgInput} type="file" accept="image/*" multiple hidden
                onChange={(e) => { addImages(e.target.files); e.currentTarget.value = ""; }} />

              <div className="mat-tools">
                <button type="button" className="btn" disabled={pending} onClick={save}>
                  {pending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn ghost sm" disabled={uploading} onClick={() => imgInput.current?.click()}>
                  {uploading ? "Uploading…" : "+ Add images"}
                </button>
                <span className="spacer" />
                <button
                  type="button"
                  className={"btn link" + (arm ? " arm" : "")}
                  disabled={pending}
                  onMouseLeave={() => setArm(false)}
                  onClick={() => (arm ? remove() : setArm(true))}
                >
                  {arm ? "Remove?" : "Remove"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mat-readfacts">
              {[{ key: "name", label: "Name" }, ...fieldsFor(k), { key: "notes", label: "Notes" }].map((f) => {
                const v = (material[f.key as keyof Material] as string | null) ?? "";
                return v ? (
                  <div className="pg-facts" key={f.key}>
                    <span className="k">{f.label}</span>
                    <div className="pg-fact-val">{v}</div>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
