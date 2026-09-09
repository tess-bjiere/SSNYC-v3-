"use client";

import { useState } from "react";
import { savePaletteLibrary, setBoardPalettes, uploadSwatchImage } from "@/app/actions/moodboards";
import {
  filledSlots,
  normalizePaletteLibrary,
  resolveBoardPalettes,
  slotLabel,
  EVERGREEN_KEY,
  type PaletteLibrary,
  type Swatch,
} from "@/lib/palette";

// The moodboard colour palette (Tess, 2026-08-12: "add color palette section to
// moodboard"; reworked 2026-09-09: "color palettes should be saved to a season
// and then allowed to be added to a moodboard -- not just applied to all
// moodboards as many of these would be seasonal").
//
// There are two things here now, not one. The LIBRARY is the brand's palettes —
// one per season plus an evergreen one — edited in a "Manage palettes" drawer and
// shared across every board. A board then shows only the palettes it has been
// GIVEN: "Add palette" puts one on this board, its × takes it off, and neither
// touches any other board. That is the whole point of the change — a season's
// colours used to appear on every board.
//
// Read mode is a quiet row of chips per attached palette. The editor (native
// colour picker + name field + optional pattern upload) is unchanged from the
// single-palette version; it just runs once per slot. Nothing is written
// mid-edit — the drawer saves the whole library on Done, and there is no
// confirm() anywhere near it (the standing rule).

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

// One read-only swatch chip, shared by the board view and the manager preview.
function Chip({ sw }: { sw: Swatch }) {
  return (
    <div className="mb-swatch">
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
  );
}

export default function ColorPalette({
  boardId,
  library,
  boardKeys,
  seasonOptions,
}: {
  boardId: string;
  library: PaletteLibrary;
  boardKeys: string[];
  seasonOptions: string[];
}) {
  // The brand library (edited in the drawer) and this board's chosen keys.
  const [lib, setLib] = useState<PaletteLibrary>(library);
  const [keys, setKeys] = useState<string[]>(boardKeys);
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  // Which swatch is mid-upload, as "FW26-2", so its Pattern button reads busy.
  const [busy, setBusy] = useState<string | null>(null);

  const shown = resolveBoardPalettes(lib, keys);
  const addable = filledSlots(lib).filter((s) => !keys.includes(s.key));

  // --- board membership: add / remove a palette from THIS board only ----------
  function addKey(key: string) {
    const next = keys.includes(key) ? keys : [...keys, key];
    setKeys(next);
    setAdding(false);
    setBoardPalettes(boardId, next);
  }
  function removeKey(key: string) {
    const next = keys.filter((k) => k !== key);
    setKeys(next);
    setBoardPalettes(boardId, next);
  }

  // --- library editing (the drawer) -------------------------------------------
  // The manager slots: evergreen always, then whatever seasons hold colours, so a
  // season appears here the moment it has a swatch and disappears when emptied.
  const managerKeys = [EVERGREEN_KEY, ...Object.keys(lib.seasons).sort((a, b) => a.localeCompare(b))];
  const seasonsToAdd = seasonOptions.filter((s) => s !== EVERGREEN_KEY && !(s in lib.seasons));

  function slotSwatches(key: string): Swatch[] {
    return key === EVERGREEN_KEY ? lib.evergreen : lib.seasons[key] ?? [];
  }
  function setSlot(key: string, next: Swatch[]) {
    setLib((l) =>
      key === EVERGREEN_KEY
        ? { ...l, evergreen: next }
        : { ...l, seasons: { ...l.seasons, [key]: next } }
    );
  }
  function addSwatch(key: string) {
    // A fresh swatch is a mid-grey — a real, saveable colour, not an empty row
    // that normalize would drop before it reaches the database.
    setSlot(key, [...slotSwatches(key), { hex: "#cccccc", name: "" }]);
  }
  function editSwatch(key: string, i: number, patch: Partial<Swatch>) {
    setSlot(key, slotSwatches(key).map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function removeSwatch(key: string, i: number) {
    setSlot(key, slotSwatches(key).filter((_, j) => j !== i));
  }
  function addSeason(season: string) {
    if (!season || season in lib.seasons) return;
    setLib((l) => ({ ...l, seasons: { ...l.seasons, [season]: [{ hex: "#cccccc", name: "" }] } }));
  }

  async function uploadPattern(key: string, i: number, file: File) {
    const id = `${key}-${i}`;
    setBusy(id);
    const small = await downscale(file);
    const fd = new FormData();
    fd.append("image", small);
    const url = await uploadSwatchImage(fd);
    setBusy(null);
    if (url) editSwatch(key, i, { image: url });
  }

  async function saveLibrary() {
    setSaving(true);
    await savePaletteLibrary(lib);
    // Reflect the same cleanup the server applied (empty seasons/swatches dropped)
    // so the drawer shows exactly what was stored.
    setLib(normalizePaletteLibrary(lib));
    setSaving(false);
    setManaging(false);
  }

  return (
    <section className="mb-palette no-print">
      <div className="mb-palette-head">
        <h2>Color palette</h2>
        <div className="mb-palette-actions">
          {addable.length > 0 && (
            <div className="mb-add-palette">
              <button type="button" className="btn link" onClick={() => setAdding((v) => !v)}>
                + Add palette
              </button>
              {adding && (
                <div className="mb-add-menu" role="menu">
                  {addable.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className="mb-add-item"
                      onClick={() => addKey(s.key)}
                    >
                      {s.label}
                      <span className="mb-add-count">{s.swatches.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn link" onClick={() => setManaging(true)}>
            Manage palettes
          </button>
        </div>
      </div>

      {/* What this board shows — only the palettes it has been given. */}
      {shown.length === 0 ? (
        <p className="mb-palette-empty">
          No palette on this board yet. Add one with “Add palette,” or build them in “Manage
          palettes.”
        </p>
      ) : (
        shown.map((slot) => (
          <div className="mb-palette-group" key={slot.key}>
            <h3>
              {slot.label}
              <button
                type="button"
                className="mb-palette-remove"
                onClick={() => removeKey(slot.key)}
                title="Remove this palette from the board (it stays in the library)"
                aria-label={`Remove ${slot.label} from this board`}
              >
                ×
              </button>
            </h3>
            <div className="mb-swatches">
              {slot.swatches.map((sw, i) => (
                <Chip sw={sw} key={i} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* The library drawer — brand-wide, shared by every board. */}
      {managing && (
        <div className="modal-overlay">
          <div className="modal modal-up">
            <div className="modal-head">
              <span>Manage palettes</span>
              <button className="notes-close" onClick={() => setManaging(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <p className="up-note">
                These palettes are shared across the brand. Edit the colours here, then add the ones
                you want to a board with “Add palette.” Evergreen is the permanent brand set; each
                season has its own.
              </p>

              {managerKeys.map((key) => {
                const swatches = slotSwatches(key);
                return (
                  <div className="mb-palette-group" key={key}>
                    <h3>{slotLabel(key)}</h3>
                    <div className="mb-swatches">
                      {swatches.map((sw, i) => (
                        <div className="mb-swatch editing" key={i}>
                          {sw.image ? (
                            <span
                              className="mb-swatch-color mb-swatch-pattern"
                              style={{ backgroundImage: `url(${sw.image})` }}
                            >
                              <button
                                type="button"
                                className="mb-swatch-clear"
                                onClick={() => editSwatch(key, i, { image: undefined })}
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
                              onChange={(e) => editSwatch(key, i, { hex: e.target.value })}
                              aria-label="Swatch colour"
                            />
                          )}
                          <input
                            type="text"
                            className="input sm mb-swatch-input"
                            placeholder="Pantone / name"
                            value={sw.name}
                            onChange={(e) => editSwatch(key, i, { name: e.target.value })}
                          />
                          {!sw.image && (
                            <label
                              className={"mb-swatch-upload" + (busy === `${key}-${i}` ? " busy" : "")}
                              title="Upload a pattern or print"
                            >
                              {busy === `${key}-${i}` ? "…" : "Pattern"}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) uploadPattern(key, i, f);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            className="mb-swatch-x"
                            onClick={() => removeSwatch(key, i)}
                            aria-label="Remove swatch"
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button" className="mb-swatch-add" onClick={() => addSwatch(key)}>
                        + Add
                      </button>
                    </div>
                  </div>
                );
              })}

              {seasonsToAdd.length > 0 && (
                <div className="mb-palette-group">
                  <h3>Add a season palette</h3>
                  <div className="mb-season-add">
                    {seasonsToAdd.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="btn ghost sm"
                        onClick={() => addSeason(s)}
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="up-foot">
              <button className="btn link" onClick={() => setManaging(false)} disabled={saving}>
                Cancel
              </button>
              <button className="btn sm" onClick={saveLibrary} disabled={saving}>
                {saving ? "Saving…" : "Save palettes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
