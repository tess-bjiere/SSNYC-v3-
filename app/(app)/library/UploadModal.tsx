"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadReferences } from "@/app/actions/upload";
import { thumbDims } from "@/lib/thumbnail";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import ImageCropper, { type CropRect } from "@/app/components/ImageCropper";
import { downscaleImage } from "@/app/components/downscaleImage";
import Combo from "./Combo";

// Downscale a picked image in the browser before it is uploaded, so the library
// grid can load a small `thumb.jpg` instead of the full-size original. Doing it
// here rather than on the server keeps the upload itself cheap and needs no
// image library. If anything about it fails we return null and the server falls
// back to pointing the thumbnail at the full image — the old behaviour.
async function makeThumb(file: File): Promise<File | null> {
  try {
    if (typeof createImageBitmap !== "function") return null;
    const bitmap = await createImageBitmap(file);
    const { w, h } = thumbDims(bitmap.width, bitmap.height);
    if (!w || !h) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob || blob.size === 0) return null;
    return new File([blob], "thumb.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}

type Picked = { file: File; url: string; crop?: CropRect | null; group?: number | null };
type Field = { key: string; label: string; type?: "textarea"; suggest?: boolean; hint?: string };

// `suggest` fields autocomplete from the curated dropdown lists (lib/lists.ts).
const REFERENCE_FIELDS: Field[] = [
  { key: "designer", label: "Designer", suggest: true },
  { key: "year", label: "Year", suggest: true },
  { key: "season", label: "Season", suggest: true },
  { key: "category", label: "Category", suggest: true, hint: "The broad group — the merchandising bucket (e.g. Outerwear, Tops)." },
  { key: "garment", label: "Garment", suggest: true, hint: "The specific piece within that group (e.g. Jacket, Tee)." },
  { key: "fabric", label: "Fabric", suggest: true },
  { key: "color", label: "Color", suggest: true },
  { key: "color_hex", label: "Color hex" },
  { key: "price", label: "Price point" },
  { key: "link", label: "Product link" },
  { key: "notes", label: "Notes", type: "textarea" },
];

// An editorial image is credited, not specced — who shot it, who is in it, where.
// Same table, same uploader, different set of fields, matching the original tool.
const EDITORIAL_FIELDS: Field[] = [
  { key: "designer", label: "Designer", suggest: true },
  { key: "year", label: "Year", suggest: true },
  { key: "season", label: "Season", suggest: true },
  { key: "photographer", label: "Photographer", suggest: true },
  { key: "photographer_ig", label: "Photographer IG" },
  { key: "model", label: "Model", suggest: true },
  { key: "location", label: "Location", suggest: true },
  { key: "link", label: "Link" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export default function UploadModal({
  options,
  kind = "reference",
  onClose,
  onToast,
}: {
  options: Record<string, string[]>;
  kind?: "reference" | "editorial";
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const FIELDS = kind === "editorial" ? EDITORIAL_FIELDS : REFERENCE_FIELDS;
  // The `kind` value is the stored `references.type` and does NOT change with
  // the rename — only the word a person reads does.
  const noun = kind === "editorial" ? "campaign image" : "reference";
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState(false);
  // Which staged image (if any) is open in the cropper. Cropping is optional —
  // a per-thumbnail button, not a forced step (Tess, 2026-09-04).
  const [cropIdx, setCropIdx] = useState<number | null>(null);
  // Stacking: which staged thumbnails are ticked, waiting to be grouped into one
  // product (Tess, 2026-09-09: "stack images of the same garment ... into one
  // profile"). Each Picked's `group` number says which stack it belongs to.
  const [stackSel, setStackSel] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const bulk = picked.length > 1;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setPicked((p) => [...p, ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setErr(null);
  }

  function removeAt(i: number) {
    setPicked((p) => {
      const copy = [...p];
      const [gone] = copy.splice(i, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return copy;
    });
    setStackSel(new Set());
  }

  function toggleStackSel(i: number) {
    setStackSel((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Group the ticked thumbnails into one product. A fresh group number, or, if the
  // selection already touches a stack, that stack — so you can add to one.
  function stackSelected() {
    if (stackSel.size < 2) return;
    setPicked((p) => {
      const existing = [...stackSel].map((i) => p[i]?.group).find((g) => typeof g === "number");
      const g = typeof existing === "number" ? existing : (Math.max(0, ...p.map((x) => x.group ?? 0)) + 1);
      return p.map((x, i) => (stackSel.has(i) ? { ...x, group: g } : x));
    });
    setStackSel(new Set());
  }

  function unstackSelected() {
    setPicked((p) => p.map((x, i) => (stackSel.has(i) ? { ...x, group: null } : x)));
    setStackSel(new Set());
  }

  const selHasStacked = [...stackSel].some((i) => picked[i]?.group != null);

  function save() {
    if (picked.length === 0) {
      setErr("Add at least one image.");
      return;
    }
    setErr(null);
    start(async () => {
      // Build the upload units: each stack (a group of images tied to one garment)
      // becomes ONE profile in a single request; every ungrouped image is its own
      // profile in its own request. One request per unit keeps a single bad file
      // from taking the rest of the batch down, and — with each image shrunk in the
      // browser first — keeps the request under the Server Action's body cap.
      const groups = new Map<number, Picked[]>();
      const singles: Picked[] = [];
      for (const p of picked) {
        if (p.group != null) {
          const arr = groups.get(p.group) ?? [];
          arr.push(p);
          groups.set(p.group, arr);
        } else singles.push(p);
      }
      const units: { items: Picked[]; combine: boolean }[] = [
        ...[...groups.values()].map((items) => ({ items, combine: true })),
        ...singles.map((p) => ({ items: [p], combine: false })),
      ];

      let added = 0;
      const errors: string[] = [];

      for (let u = 0; u < units.length; u++) {
        const unit = units[u];
        setProgress(units.length > 1 ? `Uploading ${u + 1} of ${units.length}…` : "Uploading…");

        const fd = new FormData();
        let anyFile = false;
        for (const p of unit.items) {
          // Shrink each image in the browser first — a phone photo runs 5–40 MB and
          // the upload Server Action's body is capped at ~4.5 MB on Vercel, which
          // the 25 MB Next setting can't lift (Tess, 2026-09-04). A crop still lines
          // up because its rect is stored as fractions of the image.
          const toSend = await downscaleImage(p.file);
          if (isOversize(toSend.size)) {
            errors.push(oversizeError(p.file.name, toSend.size));
            continue;
          }
          fd.append("files", toSend);
          fd.append("thumbs", (await makeThumb(toSend)) ?? new File([], "none"));
          fd.append("crops", p.crop ? JSON.stringify(p.crop) : "");
          anyFile = true;
        }
        if (!anyFile) continue;
        if (unit.combine) fd.append("combine", "1");
        // Which grid this row belongs to. The server whitelists the value, so a
        // library upload and an editorial upload differ only by this one field.
        fd.append("type", kind);
        for (const f of FIELDS) if (vals[f.key]?.trim()) fd.append(f.key, vals[f.key].trim());

        try {
          const res = await uploadReferences(fd);
          added += res.count;
          errors.push(...res.errors);
        } catch (e) {
          errors.push(`${unit.items[0].file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        }
      }

      setProgress(null);

      if (added > 0) {
        onToast(
          errors.length
            ? `${added} added · ${errors.length} failed`
            : added === 1
              ? `1 ${noun} added`
              : `${added} ${noun}s added`
        );
        router.refresh();
        onClose();
      } else {
        setErr(errors[0] || "Upload failed.");
      }
    });
  }

  return (
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div className="modal modal-up">
        <div className="modal-head">
          <span>{bulk ? `Add ${picked.length} ${noun}s` : `Add ${noun}`}</span>
          <button className="notes-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body up-body">
          <div
            className={"up-drop" + (drag ? " over" : "")}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => addFiles(e.target.files)}
            />
            {picked.length === 0 ? (
              <span>Drop images here, or click to choose. Select several for a bulk add.</span>
            ) : (
              <div className="up-thumbs">
                {picked.map((p, i) => (
                  <div
                    className={
                      "up-thumb" +
                      (p.crop ? " cropped" : "") +
                      (p.group != null ? " stacked" : "") +
                      (stackSel.has(i) ? " picksel" : "")
                    }
                    key={i}
                  >
                    <img src={p.url} alt="" />
                    <button className="up-x" onClick={(e) => { e.stopPropagation(); removeAt(i); }} title="Remove">×</button>
                    {/* Tick to select this image for stacking into one product. */}
                    <button
                      className={"up-pick" + (stackSel.has(i) ? " on" : "")}
                      onClick={(e) => { e.stopPropagation(); toggleStackSel(i); }}
                      title="Select to stack with others"
                    >
                      {stackSel.has(i) ? "✓" : ""}
                    </button>
                    {p.group != null && <span className="up-groupbadge">Stack {p.group}</span>}
                    <button className="up-crop" onClick={(e) => { e.stopPropagation(); setCropIdx(i); }} title="Crop this image">
                      {p.crop ? "Cropped ✓" : "Crop"}
                    </button>
                  </div>
                ))}
                <div className="up-add">+ more</div>
              </div>
            )}
          </div>

          {/* Stack controls — tick same-garment images and combine them into one
              profile (Tess, 2026-09-09). Shown once there is more than one image. */}
          {bulk && (
            <div className="up-stackbar">
              <span className="up-stackhint">
                Same garment shot several ways? Tick those images, then stack them into one profile.
              </span>
              {stackSel.size >= 2 && (
                <button className="btn ghost sm" type="button" onClick={stackSelected}>
                  {selHasStacked ? `Add ${stackSel.size} to the stack` : `Stack ${stackSel.size} into one profile`}
                </button>
              )}
              {selHasStacked && (
                <button className="btn link" type="button" onClick={unstackSelected}>Unstack</button>
              )}
            </div>
          )}

          {bulk && (
            <div className="up-note">These details apply to all {picked.length} images. You can edit each one individually afterward.</div>
          )}

          <div className="up-fields">
            {FIELDS.map((f) =>
              f.type === "textarea" ? (
                <div className="field up-full" key={f.key}>
                  <label>{f.label}</label>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={vals[f.key] || ""}
                    onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  {f.suggest && (options[f.key]?.length ?? 0) > 0 ? (
                    <Combo
                      value={vals[f.key] || ""}
                      options={options[f.key]}
                      onChange={(val) => setVals((v) => ({ ...v, [f.key]: val }))}
                    />
                  ) : (
                    <input
                      className="input"
                      autoComplete="off"
                      value={vals[f.key] || ""}
                      onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                  {f.hint && <span className="field-hint">{f.hint}</span>}
                </div>
              )
            )}
          </div>

          {err && <div className="up-err">{err}</div>}
        </div>

        <div className="up-foot">
          <button className="btn link" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn sm" onClick={save} disabled={pending || picked.length === 0}>
            {pending ? progress || "Uploading…" : bulk ? `Add ${picked.length}` : `Add ${noun}`}
          </button>
        </div>
      </div>

      {/* The crop overlay for the one image whose Crop button was pressed. Its
          rect is remembered on that staged file and applied server-side on save,
          reusing the same cropper the materials and style photos use. */}
      {cropIdx !== null && picked[cropIdx] && (
        <ImageCropper
          src={picked[cropIdx].url}
          title="Crop image"
          onCancel={() => setCropIdx(null)}
          onApply={(rect) => {
            setPicked((p) => p.map((x, i) => (i === cropIdx ? { ...x, crop: rect } : x)));
            setCropIdx(null);
          }}
        />
      )}
    </div>
  );
}
