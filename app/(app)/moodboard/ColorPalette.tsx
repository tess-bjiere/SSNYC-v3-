"use client";

import { useState } from "react";
import { saveColorPalette, uploadSwatchImage } from "@/app/actions/moodboards";
import { PALETTE_GROUPS, type Palette, type PaletteGroupKey, type Swatch } from "@/lib/palette";

// The colour palette on the moodboard (Tess, 2026-08-12: "add color palette
// section to moodboard -- allows user to fill in seasonal and evergreen color
// swatches / pantones for easy reference").
//
// Read mode is a quiet row of chips with their Pantone/name under each — the
// "easy reference" it exists to be. Edit turns each chip into a native colour
// picker plus a name field, with Add and a remove ×, and saves the whole palette
// on Done. State is local until then, so nothing is written mid-edit and there
// is no confirm() dialog anywhere near it (the standing rule).
//
// A swatch can also carry an uploaded pattern/print instead of a flat colour
// (Tess, 2026-08-12: "you can upload swatch for pattern if needed"). The image is
// downscaled in the browser, uploaded on pick, and its URL sits on the swatch
// until the next Done persists the palette — the same two-step the brand logo
// uses. A new swatch starts as a mid-grey so it is a real, saveable colour rather
// than an empty row that normalizePalette would drop on the way to the database.

/** Shrink a picked image before upload — a swatch chip is tiny, so 512px is plenty. */
async function downscale(file: File, max = 512): Promise<File> {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size === 0) return file;
    return new File([blob], "pattern.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function ColorPalette({ initial }: { initial: Palette }) {
  const [pal, setPal] = useState<Palette>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Which swatch is mid-upload, as "seasonal-2", so its Pattern button reads busy.
  const [busy, setBusy] = useState<string | null>(null);

  const empty = pal.seasonal.length === 0 && pal.evergreen.length === 0;

  function addSwatch(key: PaletteGroupKey) {
    setPal((p) => ({ ...p, [key]: [...p[key], { hex: "#cccccc", name: "" }] }));
  }
  function editSwatch(key: PaletteGroupKey, i: number, patch: Partial<Swatch>) {
    setPal((p) => ({ ...p, [key]: p[key].map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }
  function removeSwatch(key: PaletteGroupKey, i: number) {
    setPal((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }));
  }

  async function uploadPattern(key: PaletteGroupKey, i: number, file: File) {
    const id = `${key}-${i}`;
    setBusy(id);
    const small = await downscale(file);
    const fd = new FormData();
    fd.append("image", small);
    const url = await uploadSwatchImage(fd);
    setBusy(null);
    if (url) editSwatch(key, i, { image: url });
  }

  async function done() {
    setSaving(true);
    await saveColorPalette(pal);
    setSaving(false);
    setEditing(false);
  }

  // Nothing to show and not editing: a single quiet prompt rather than an empty
  // box, so the section earns its space only once it holds something.
  if (empty && !editing) {
    return (
      <section className="mb-palette no-print">
        <div className="mb-palette-head">
          <h2>Color palette</h2>
          <button type="button" className="btn link" onClick={() => setEditing(true)}>
            Add colors
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-palette no-print">
      <div className="mb-palette-head">
        <h2>Color palette</h2>
        {editing ? (
          <button type="button" className="btn link" onClick={done} disabled={saving}>
            {saving ? "Saving…" : "Done"}
          </button>
        ) : (
          <button type="button" className="btn link" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {PALETTE_GROUPS.map((g) => {
        const swatches = pal[g.key];
        return (
          <div className="mb-palette-group" key={g.key}>
            <h3>{g.label}</h3>
            <div className="mb-swatches">
              {swatches.map((sw, i) =>
                editing ? (
                  <div className="mb-swatch editing" key={i}>
                    {sw.image ? (
                      <span
                        className="mb-swatch-color mb-swatch-pattern"
                        style={{ backgroundImage: `url(${sw.image})` }}
                      >
                        <button
                          type="button"
                          className="mb-swatch-clear"
                          onClick={() => editSwatch(g.key, i, { image: undefined })}
                          aria-label="Remove pattern"
                          title="Remove pattern"
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      <input
                        type="color"
                        className="mb-swatch-color"
                        value={sw.hex || "#cccccc"}
                        onChange={(e) => editSwatch(g.key, i, { hex: e.target.value })}
                        aria-label="Swatch colour"
                      />
                    )}
                    <input
                      type="text"
                      className="input sm mb-swatch-input"
                      placeholder="Pantone / name"
                      value={sw.name}
                      onChange={(e) => editSwatch(g.key, i, { name: e.target.value })}
                    />
                    {!sw.image && (
                      <label
                        className={"mb-swatch-upload" + (busy === `${g.key}-${i}` ? " busy" : "")}
                        title="Upload a pattern or print"
                      >
                        {busy === `${g.key}-${i}` ? "…" : "Pattern"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadPattern(g.key, i, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="mb-swatch-x"
                      onClick={() => removeSwatch(g.key, i)}
                      aria-label="Remove swatch"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="mb-swatch" key={i}>
                    <span
                      className={"mb-swatch-chip" + (sw.image || sw.hex ? "" : " none")}
                      style={
                        sw.image
                          ? { backgroundImage: `url(${sw.image})` }
                          : sw.hex
                            ? { background: sw.hex }
                            : undefined
                      }
                      title={sw.name || sw.hex || undefined}
                    />
                    <span className="mb-swatch-label">
                      {sw.name && <span className="mb-swatch-name">{sw.name}</span>}
                      {sw.image ? (
                        !sw.name && <span className="mb-swatch-hex">Pattern</span>
                      ) : (
                        sw.hex && <span className="mb-swatch-hex">{sw.hex}</span>
                      )}
                    </span>
                  </div>
                )
              )}

              {editing && (
                <button
                  type="button"
                  className="mb-swatch-add"
                  onClick={() => addSwatch(g.key)}
                >
                  + Add
                </button>
              )}
              {!editing && swatches.length === 0 && (
                <span className="mb-palette-empty">None yet</span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
