"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadReferences } from "@/app/actions/upload";
import { thumbDims } from "@/lib/thumbnail";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
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

type Picked = { file: File; url: string };
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
  }

  function save() {
    if (picked.length === 0) {
      setErr("Add at least one image.");
      return;
    }
    setErr(null);
    start(async () => {
      // One request per image rather than one request for the whole batch. A
      // Server Action body is capped (see lib/uploadLimits.ts), and a bulk add of
      // twenty photos would blow past any sane ceiling if sent together. Sending
      // them one at a time also means a single bad file fails on its own instead
      // of taking the rest of the batch down with it.
      let added = 0;
      const errors: string[] = [];

      for (let i = 0; i < picked.length; i++) {
        const { file } = picked[i];
        setProgress(picked.length > 1 ? `Uploading ${i + 1} of ${picked.length}…` : "Uploading…");

        if (isOversize(file.size)) {
          errors.push(oversizeError(file.name, file.size));
          continue;
        }

        const fd = new FormData();
        // "files" and "thumbs" are paired by position — one thumb entry per file,
        // even when generating it failed (an empty placeholder keeps the indexes
        // lined up, and the server treats it as "no thumbnail").
        fd.append("files", file);
        const t = await makeThumb(file);
        fd.append("thumbs", t ?? new File([], "none"));
        // Which grid this row belongs to. The server whitelists the value, so a
        // library upload and an editorial upload differ only by this one field.
        fd.append("type", kind);
        for (const f of FIELDS) if (vals[f.key]?.trim()) fd.append(f.key, vals[f.key].trim());

        try {
          const res = await uploadReferences(fd);
          added += res.count;
          errors.push(...res.errors);
        } catch (e) {
          errors.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-up" onClick={(e) => e.stopPropagation()}>
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
                  <div className="up-thumb" key={i}>
                    <img src={p.url} alt="" />
                    <button className="up-x" onClick={(e) => { e.stopPropagation(); removeAt(i); }} title="Remove">×</button>
                  </div>
                ))}
                <div className="up-add">+ more</div>
              </div>
            )}
          </div>

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
    </div>
  );
}
