"use client";

import { useState } from "react";
import { savePaletteLibrary, setBoardPalettes, renamePaletteSeason, uploadSwatchImage } from "@/app/actions/moodboards";
import {
  filledSlots,
  normalizePaletteLibrary,
  resolveBoardPalettes,
  remapBoardKeys,
  EVERGREEN_KEY,
  type PaletteLibrary,
  type Swatch,
} from "@/lib/palette";

// One editable row in the Manage-palettes drawer (Tess, 2026-09-14: "easily
// change the palette name"). The row keeps a stable `id` so the name field can be
// retyped without the palette being re-keyed mid-edit, and remembers `origName`
// so a save can tell a rename (origName → name) from a brand-new palette (no
// origName) and carry the rename onto the boards that already show it.
type EditSlot = { id: string; origName: string | null; name: string; swatches: Swatch[] };

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
  // Click-to-rename on the board's palette label (Tess, 2026-09-15: "add ability
  // to change a palette name"). `renamingKey` is the season key being edited (never
  // evergreen), `renameText` the field value; commits immediately, not on a Save.
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  // Which swatch is mid-upload, as "FW26-2", so its Pattern button reads busy.
  const [busy, setBusy] = useState<string | null>(null);

  // The drawer edits a SNAPSHOT of the library, not `lib` directly, so a palette
  // keeps a stable row while its name is retyped (no re-key mid-keystroke, no lost
  // focus) and Cancel just throws the snapshot away. Snapshotted in openManager(),
  // written in saveLibrary(). `mgrEver` = evergreen swatches; `mgrSeasons` = one
  // row per season palette; `newName` = the free-form "New palette" field.
  const [mgrEver, setMgrEver] = useState<Swatch[]>([]);
  const [mgrSeasons, setMgrSeasons] = useState<EditSlot[]>([]);
  const [newName, setNewName] = useState("");
  // Two-click arm before a palette is removed (CLAUDE.md: no confirm()). The
  // removal is only local until Save, and Cancel restores it.
  const [armDelId, setArmDelId] = useState<string | null>(null);

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

  // --- rename a season palette from its label on the board --------------------
  function beginRename(key: string, label: string) {
    if (key === EVERGREEN_KEY) return; // the reserved set keeps its name
    setRenamingKey(key);
    setRenameText(label);
  }
  function commitRename() {
    const from = renamingKey;
    const to = renameText.trim();
    setRenamingKey(null);
    if (!from || !to || to === from || from === EVERGREEN_KEY) return;
    // Move the colours under the new name locally and follow the rename onto this
    // board's own key list, so the label updates at once; the server does the same
    // to the library and every other board.
    setLib((l) => {
      const moved = l.seasons[from];
      if (!moved) return l;
      const seasons = { ...l.seasons };
      delete seasons[from];
      seasons[to] = moved;
      return { ...l, seasons };
    });
    setKeys((ks) => remapBoardKeys(ks, [{ from, to }]));
    renamePaletteSeason(from, to);
  }

  // --- library editing (the drawer) -------------------------------------------
  // Open the drawer on a fresh snapshot of the library: evergreen swatches, and a
  // row per season with its current name remembered as origName.
  function openManager() {
    setMgrEver(lib.evergreen.map((s) => ({ ...s })));
    setMgrSeasons(
      Object.keys(lib.seasons)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          id: crypto.randomUUID(),
          origName: name,
          name,
          swatches: lib.seasons[name].map((s) => ({ ...s })),
        }))
    );
    setNewName("");
    setArmDelId(null);
    setManaging(true);
  }

  // Season names already in the drawer, so the curated quick-adds only offer ones
  // that are not already present.
  const seasonsToAdd = seasonOptions.filter(
    (s) => s !== EVERGREEN_KEY && !mgrSeasons.some((x) => x.name.trim() === s)
  );

  // Swatch editing keyed by a `target`: the evergreen block ("evergreen") or a
  // season row's id. One set of helpers serves both.
  function tSwatches(target: string): Swatch[] {
    return target === EVERGREEN_KEY ? mgrEver : mgrSeasons.find((s) => s.id === target)?.swatches ?? [];
  }
  function tSet(target: string, next: Swatch[]) {
    if (target === EVERGREEN_KEY) setMgrEver(next);
    else setMgrSeasons((ss) => ss.map((s) => (s.id === target ? { ...s, swatches: next } : s)));
  }
  function addSwatch(target: string) {
    // A fresh swatch is a mid-grey — a real, saveable colour, not an empty row
    // that normalize would drop before it reaches the database.
    tSet(target, [...tSwatches(target), { hex: "#cccccc", name: "" }]);
  }
  function editSwatch(target: string, i: number, patch: Partial<Swatch>) {
    tSet(target, tSwatches(target).map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  function removeSwatch(target: string, i: number) {
    tSet(target, tSwatches(target).filter((_, j) => j !== i));
  }

  function renameSlot(id: string, name: string) {
    setMgrSeasons((ss) => ss.map((s) => (s.id === id ? { ...s, name } : s)));
  }
  function removeSlot(id: string) {
    setMgrSeasons((ss) => ss.filter((s) => s.id !== id));
    setArmDelId(null);
  }
  // Create a palette with any name (free-form) or from a curated quick-add. It
  // starts with one grey swatch so it survives the save (an empty palette is
  // dropped by normalize).
  function addPalette(name: string) {
    const nm = name.trim();
    if (!nm || mgrSeasons.some((s) => s.name.trim() === nm)) return;
    setMgrSeasons((ss) => [
      ...ss,
      { id: crypto.randomUUID(), origName: null, name: nm, swatches: [{ hex: "#cccccc", name: "" }] },
    ]);
    setNewName("");
  }

  async function uploadPattern(target: string, i: number, file: File) {
    const id = `${target}-${i}`;
    setBusy(id);
    const small = await downscale(file);
    const fd = new FormData();
    fd.append("image", small);
    const url = await uploadSwatchImage(fd);
    setBusy(null);
    if (url) editSwatch(target, i, { image: url });
  }

  async function saveLibrary() {
    setSaving(true);
    // Build the library from the rows. Last writer wins if two rows share a name.
    const seasons: Record<string, Swatch[]> = {};
    for (const s of mgrSeasons) {
      const nm = s.name.trim();
      if (!nm || nm === EVERGREEN_KEY) continue;
      seasons[nm] = s.swatches;
    }
    const nextLib = normalizePaletteLibrary({ evergreen: mgrEver, seasons });
    // A row whose name changed is a rename — carried onto the boards that show it
    // (server side), but only when the renamed palette actually survives the save.
    const renames = mgrSeasons
      .filter((s) => s.origName && s.name.trim() && s.name.trim() !== s.origName)
      .map((s) => ({ from: s.origName as string, to: s.name.trim() }))
      .filter((r) => nextLib.seasons[r.to]);

    await savePaletteLibrary(nextLib, renames);
    // Keep THIS board's selection pointing at the renamed palette without a reload.
    if (renames.length) setKeys((ks) => remapBoardKeys(ks, renames));
    setLib(nextLib);
    setSaving(false);
    setManaging(false);
  }

  // The colour editor for one palette (evergreen or a season row), keyed by
  // `target`. Same markup for both, so evergreen and every season stay identical.
  function swatchEditor(target: string) {
    const swatches = tSwatches(target);
    return (
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
                  onClick={() => editSwatch(target, i, { image: undefined })}
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
                onChange={(e) => editSwatch(target, i, { hex: e.target.value })}
                aria-label="Swatch colour"
              />
            )}
            <input
              type="text"
              className="input sm mb-swatch-input"
              placeholder="Pantone / name"
              value={sw.name}
              onChange={(e) => editSwatch(target, i, { name: e.target.value })}
            />
            {!sw.image && (
              <label
                className={"mb-swatch-upload" + (busy === `${target}-${i}` ? " busy" : "")}
                title="Upload a pattern or print"
              >
                {busy === `${target}-${i}` ? "…" : "Pattern"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPattern(target, i, f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <button
              type="button"
              className="mb-swatch-x"
              onClick={() => removeSwatch(target, i)}
              aria-label="Remove swatch"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="mb-swatch-add" onClick={() => addSwatch(target)}>
          + Add
        </button>
      </div>
    );
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
          <button type="button" className="btn link" onClick={openManager}>
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
              {slot.key === EVERGREEN_KEY ? (
                // Evergreen is the reserved set — shown, never renamed.
                slot.label
              ) : renamingKey === slot.key ? (
                <input
                  className="input sm mb-palette-rename"
                  autoFocus
                  value={renameText}
                  aria-label="Palette name"
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                    if (e.key === "Escape") setRenamingKey(null);
                  }}
                />
              ) : (
                // Click the name to rename it — everywhere it appears (Tess,
                // 2026-09-15). A quiet pencil ✎ hints it is editable.
                <button
                  type="button"
                  className="mb-palette-nameedit"
                  onClick={() => beginRename(slot.key, slot.label)}
                  title="Rename this palette (updates it everywhere it appears)"
                >
                  {slot.label}
                  <span className="mb-palette-pencil" aria-hidden="true">✎</span>
                </button>
              )}
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
                These palettes are shared across the brand — editing a colour here updates it
                everywhere the palette shows. Renaming a palette follows onto the boards using it.
                Add a palette to a board from “Add palette”; that only affects that board.
              </p>

              {/* Evergreen — the permanent brand set. Its name is fixed. */}
              <div className="mb-palette-group">
                <h3 className="mb-palette-title">Evergreen</h3>
                {swatchEditor(EVERGREEN_KEY)}
              </div>

              {/* One row per season palette — the name is editable in place. */}
              {mgrSeasons.map((slot) => (
                <div className="mb-palette-group" key={slot.id}>
                  <div
                    className="mb-palette-titlerow"
                    onMouseLeave={() => setArmDelId((a) => (a === slot.id ? null : a))}
                  >
                    <input
                      className="input sm mb-palette-name"
                      value={slot.name}
                      placeholder="Palette name"
                      aria-label="Palette name"
                      onChange={(e) => renameSlot(slot.id, e.target.value)}
                    />
                    {armDelId === slot.id ? (
                      <button
                        type="button"
                        className="btn link sm mb-palette-del armed"
                        onClick={() => removeSlot(slot.id)}
                      >
                        Remove?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn link sm mb-palette-del"
                        onClick={() => setArmDelId(slot.id)}
                        title="Remove this palette from the library (and from every board that shows it)"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {swatchEditor(slot.id)}
                </div>
              ))}

              {/* Create a palette with ANY name (Tess wanted "Spring / Summer 2027",
                  which is not a curated season), plus the curated seasons as quick-adds. */}
              <div className="mb-palette-group">
                <h3 className="mb-palette-title">New palette</h3>
                <div className="mb-newpalette">
                  <input
                    className="input sm"
                    value={newName}
                    placeholder="Name a palette (e.g. Spring / Summer 2027)"
                    aria-label="New palette name"
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addPalette(newName); }
                    }}
                  />
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => addPalette(newName)}
                    disabled={!newName.trim()}
                  >
                    Add
                  </button>
                </div>
                {seasonsToAdd.length > 0 && (
                  <div className="mb-season-add">
                    {seasonsToAdd.map((s) => (
                      <button key={s} type="button" className="btn link sm" onClick={() => addPalette(s)}>
                        + {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
