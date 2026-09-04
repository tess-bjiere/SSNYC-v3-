"use client";

// The reference detail card. Shared by the Library grid and the Moodboard, so a
// reference reads the same wherever you click it.
//
// `actions` controls which buttons appear:
//   "library"   — Edit / Share / Develop this / Add to moodboard / Delete
//   "editorial" — Edit / Share / Delete. Same as the library minus the moodboard
//                 and develop buttons: editorial images are credits, not the
//                 product references a style gets made from.
//   "board"     — Edit / Share / Develop this. No Delete from a moodboard:
//                 deleting there would remove the reference from the whole
//                 library, which is not what clicking an image on a board
//                 should ever do.
//   "read-only" — no actions at all.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refImage, extraImageUrls, type Reference } from "@/lib/types";
import Lightbox from "@/app/components/Lightbox";
import ImageCropper, { type CropRect } from "@/app/components/ImageCropper";
import {
  updateReference,
  softDeleteReference,
  addReferenceImages,
  removeReferenceImage,
  cropReferenceImage,
} from "@/app/actions/references";
import {
  developFromReference,
  linkReference,
  searchStyles,
  stylesForReference,
  unlinkReference,
  type LinkedStyle,
} from "@/app/actions/styleRefs";
import Combo from "./Combo";

// Editable fields for the in-place Edit form. `suggest` fields offer the curated
// dropdown (when options are passed in), the same lists the Add form uses so a
// value is tagged consistently wherever it is filled in. `hint` is the small
// helper line under a field.
const EDIT_FIELDS: {
  key: keyof Reference;
  label: string;
  type?: "text" | "textarea";
  suggest?: boolean;
  hint?: string;
}[] = [
  { key: "designer", label: "Designer", suggest: true },
  { key: "year", label: "Year", suggest: true },
  { key: "season", label: "Season", suggest: true },
  { key: "category", label: "Category", suggest: true, hint: "The broad group — the merchandising bucket (e.g. Outerwear, Tops)." },
  { key: "garment", label: "Garment", suggest: true, hint: "The specific piece within that group (e.g. Jacket, Tee)." },
  { key: "fabric", label: "Fabric", suggest: true },
  { key: "color", label: "Color", suggest: true },
  { key: "color_hex", label: "Color hex" },
  { key: "price", label: "Price point" },
  { key: "photographer", label: "Photographer", suggest: true },
  { key: "photographer_ig", label: "Photographer IG" },
  { key: "model", label: "Model", suggest: true },
  { key: "location", label: "Location", suggest: true },
  { key: "link", label: "Product link" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export type DetailActions = "library" | "editorial" | "board" | "read-only";

export default function DetailModal({
  r,
  onClose,
  onAdd,
  onToast,
  onDeleted,
  actions = "library",
  options = {},
}: {
  r: Reference;
  onClose: () => void;
  onAdd?: () => void;
  onToast: (m: string) => void;
  onDeleted?: () => void;
  actions?: DetailActions;
  // The curated dropdown vocabulary per field (category, garment, …). When a
  // field has options they show as an autocomplete; otherwise it's a plain input.
  options?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [cur, setCur] = useState<Reference>(r);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  // Adding / removing images on this one reference (extra angles). New images are
  // STAGED first — dropped or picked, optionally cropped — then added together
  // (Tess, 2026-09-04: "add more images, i should be able to drag them in and
  // crop"). Same shape and cropper as the library upload modal.
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [staged, setStaged] = useState<{ file: File; url: string; crop?: CropRect | null }[]>([]);
  const [stageCropIdx, setStageCropIdx] = useState<number | null>(null);
  const [imgDrag, setImgDrag] = useState(false);
  // Re-cropping an image already on this reference: the URL being cropped.
  const [recropUrl, setRecropUrl] = useState<string | null>(null);
  const [recropBusy, setRecropBusy] = useState(false);

  function applyRecrop(rect: CropRect) {
    const url = recropUrl;
    if (!url) return;
    setRecropBusy(true);
    start(async () => {
      const res = await cropReferenceImage(cur.id, url, rect);
      setRecropBusy(false);
      setRecropUrl(null);
      if (res.ok) {
        setCur((c) =>
          res.extra_images
            ? { ...c, extra_images: res.extra_images }
            : { ...c, image_url: res.url ?? c.image_url, thumb_url: res.thumb_url ?? c.thumb_url }
        );
        // Keep the large view pointing at the same image after its URL changes.
        setActive((a) => (a === url ? res.url ?? a : a));
        onToast("Image cropped");
      } else {
        onToast(res.error || "Couldn't crop the image.");
      }
    });
  }

  function stageFiles(list: FileList | null) {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setStaged((s) => [...s, ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }
  function removeStaged(i: number) {
    setStaged((s) => {
      const copy = [...s];
      const [gone] = copy.splice(i, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return copy;
    });
  }
  function addStaged() {
    if (staged.length === 0) return;
    setImgBusy(true);
    start(async () => {
      const fd = new FormData();
      for (const s of staged) {
        fd.append("files", s.file);
        fd.append("crops", s.crop ? JSON.stringify(s.crop) : "");
      }
      const res = await addReferenceImages(cur.id, fd);
      setImgBusy(false);
      if (res.ok) {
        setCur((c) => ({ ...c, extra_images: res.extra_images }));
        onToast(res.errors.length ? `Added · ${res.errors.length} failed` : "Images added");
        staged.forEach((s) => URL.revokeObjectURL(s.url));
        setStaged([]);
      } else {
        onToast(res.errors[0] || "Could not add the images.");
      }
    });
  }

  function dropImage(url: string) {
    setImgBusy(true);
    start(async () => {
      const res = await removeReferenceImage(cur.id, url);
      setImgBusy(false);
      if (res.ok) {
        setCur((c) => ({ ...c, extra_images: res.extra_images }));
        onToast("Image removed");
      }
    });
  }

  const images = [refImage(cur), ...extraImageUrls(cur)].filter(Boolean);
  const [active, setActive] = useState(images[0] || "");
  // The image box takes the picture's own shape rather than a fixed square, so a
  // vertical reference fills it and a wider one expands the modal (Tess,
  // 2026-08-11). Read the shape off the loaded image; reset to the portrait
  // default while a newly-picked one loads.
  const [mainAspect, setMainAspect] = useState<string | undefined>(undefined);
  useEffect(() => setMainAspect(undefined), [active]);
  // Click the main image for a full-screen look (Tess, 2026-08-20: "ability to
  // view image in a larger view"). The same Lightbox the materials gallery uses;
  // paging it also moves the modal's own selection, so closing keeps your place.
  const [lbOpen, setLbOpen] = useState(false);

  // --- Develop this ------------------------------------------------------
  // A reference can be developed from the library and from a board — both are
  // places where you are looking at a product reference and deciding to make it.
  // Editorial credits and read-only views are not.
  const canDevelop = actions === "library" || actions === "board";

  const [links, setLinks] = useState<LinkedStyle[] | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [picks, setPicks] = useState<LinkedStyle[]>([]);
  const [armedUnlink, setArmedUnlink] = useState<string | null>(null);

  // Loaded once when the card opens, so "In development" shows without a click.
  // One small query, and only on the surfaces that can develop.
  useEffect(() => {
    if (!canDevelop) return;
    let live = true;
    stylesForReference(cur.id)
      .then((s) => live && setLinks(s))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [canDevelop, cur.id]);

  // The picker's list, refreshed as you type. Styles already linked are filtered
  // out rather than shown and rejected.
  useEffect(() => {
    if (!devOpen) return;
    let live = true;
    const t = setTimeout(() => {
      searchStyles(pickQ)
        .then((s) => live && setPicks(s))
        .catch(() => live && setPicks([]));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [devOpen, pickQ]);

  const linkedIds = new Set((links ?? []).map((s) => s.id));

  function develop() {
    setDevBusy(true);
    start(async () => {
      const res = await developFromReference(cur.id);
      setDevBusy(false);
      if (res.id) {
        onToast("Style created");
        router.push(`/styles/${res.id}`);
        return;
      }
      onToast(res.error || "Could not create the style.");
    });
  }

  function link(styleId: string) {
    setDevBusy(true);
    start(async () => {
      const res = await linkReference(styleId, cur.id);
      setDevBusy(false);
      if (!res.ok) return onToast(res.error || "Could not link that style.");
      setLinks(res.styles ?? []);
      setPickQ("");
      onToast("Linked");
    });
  }

  function unlink(styleId: string) {
    setDevBusy(true);
    start(async () => {
      const res = await unlinkReference(styleId, cur.id);
      setDevBusy(false);
      setArmedUnlink(null);
      if (!res.ok) return onToast(res.error || "Could not unlink that style.");
      setLinks(res.styles ?? []);
      onToast("Unlinked — the reference is untouched");
    });
  }

  function beginEdit() {
    const d: Record<string, string> = {};
    for (const f of EDIT_FIELDS) d[f.key] = (cur[f.key] as string) || "";
    setDraft(d);
    setConfirmDel(false);
    setEditing(true);
  }

  function save() {
    start(async () => {
      await updateReference(cur.id, draft);
      setCur((c) => ({ ...c, ...(draft as Partial<Reference>) }));
      setEditing(false);
      onToast("Saved");
    });
  }

  function share() {
    const url = `${window.location.origin}/r/${cur.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => onToast("Link copied")).catch(() => onToast(url));
    } else {
      onToast(url);
    }
  }

  function del() {
    start(async () => {
      await softDeleteReference(cur.id);
      onDeleted?.();
    });
  }

  const rows: [string, React.ReactNode][] = [
    ["Year", cur.year],
    ["Season", cur.season],
    ["Category", cur.category],
    ["Garment", cur.garment],
    ["Fabric", cur.fabric],
    ["Color", cur.color ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
        {cur.color_hex && (
          <span style={{ width: 16, height: 16, background: cur.color_hex, border: "1px solid var(--line)", display: "inline-block" }} />
        )}
        {cur.color}
      </span>
    ) : null],
    ["Price point", cur.price],
    ["Photographer", [cur.photographer, cur.photographer_ig].filter(Boolean).join(" · ")],
    ["Model", cur.model],
    ["Location", cur.location],
    ["Notes", cur.notes],
  ];

  return (
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div className="modal modal-lg detail-modal">
        <div className="detail-grid">
          <div className="detail-imgs">
            <div className="detail-main" style={{ aspectRatio: mainAspect }}>
              {active ? (
                <img
                  src={active}
                  alt={cur.designer || ""}
                  className="detail-zoom"
                  title="View larger"
                  onClick={() => setLbOpen(true)}
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    if (w && h) setMainAspect(`${w} / ${h}`);
                  }}
                />
              ) : null}
            </div>
            {images.length > 1 && (
              <div className="detail-thumbs">
                {images.map((im, i) => (
                  <button key={i} className={"detail-thumb" + (im === active ? " active" : "")} onClick={() => setActive(im)}>
                    <img src={im} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
          {lbOpen && (
            <Lightbox
              images={images}
              index={Math.max(0, images.indexOf(active))}
              onIndex={(i) => setActive(images[i])}
              onClose={() => setLbOpen(false)}
            />
          )}

          {/* Crop a staged image before it is added to this reference. */}
          {stageCropIdx !== null && staged[stageCropIdx] && (
            <ImageCropper
              src={staged[stageCropIdx].url}
              title="Crop image"
              onCancel={() => setStageCropIdx(null)}
              onApply={(rect) => {
                setStaged((s) => s.map((x, i) => (i === stageCropIdx ? { ...x, crop: rect } : x)));
                setStageCropIdx(null);
              }}
            />
          )}

          {/* Re-crop an image already on the reference — applied server-side. */}
          {recropUrl && (
            <ImageCropper
              src={recropUrl}
              title="Crop image"
              busy={recropBusy}
              onCancel={() => setRecropUrl(null)}
              onApply={applyRecrop}
            />
          )}

          <div className="detail-info">
            <button className="detail-x" onClick={onClose} aria-label="Close">×</button>

            {editing ? (
              <>
                <div className="detail-head">
                  <h2 className="display">Edit reference</h2>
                </div>

                {/* Manage this reference's images — the main one plus extra angles
                    (Tess, 2026-08-12: "upload multiple images for a single
                    reference"). The first image is primary and can't be removed
                    here; extras get an ×, and "+ add" appends more. */}
                <div className="detail-editimgs">
                  <label>Images</label>
                  {/* The images already on this reference — first is primary. */}
                  <div className="up-thumbs">
                    {[refImage(cur), ...extraImageUrls(cur)].filter(Boolean).map((im, i) => (
                      <div className="up-thumb" key={im}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im} alt="" />
                        {i > 0 && (
                          <button
                            className="up-x"
                            title="Remove this image"
                            disabled={imgBusy}
                            onClick={() => dropImage(im)}
                          >
                            ×
                          </button>
                        )}
                        {/* Re-crop this existing image in place (Tess, 2026-09-04:
                            "crop functionality to ... edit of reference images"). */}
                        <button
                          className="up-crop"
                          title="Crop this image"
                          disabled={recropBusy}
                          onClick={() => setRecropUrl(im)}
                        >
                          Crop
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Drag more in (or click), crop any of them, then add together. */}
                  <div
                    className={"up-drop" + (imgDrag ? " over" : "")}
                    onClick={() => imgInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setImgDrag(true); }}
                    onDragLeave={() => setImgDrag(false)}
                    onDrop={(e) => { e.preventDefault(); setImgDrag(false); stageFiles(e.dataTransfer.files); }}
                  >
                    <input
                      ref={imgInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => { stageFiles(e.target.files); e.currentTarget.value = ""; }}
                    />
                    {staged.length === 0 ? (
                      <span>Drop images here, or click to choose.</span>
                    ) : (
                      <div className="up-thumbs">
                        {staged.map((s, i) => (
                          <div className={"up-thumb" + (s.crop ? " cropped" : "")} key={i}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.url} alt="" />
                            <button className="up-x" onClick={(e) => { e.stopPropagation(); removeStaged(i); }} title="Remove">×</button>
                            <button className="up-crop" onClick={(e) => { e.stopPropagation(); setStageCropIdx(i); }} title="Crop this image">
                              {s.crop ? "Cropped ✓" : "Crop"}
                            </button>
                          </div>
                        ))}
                        <div className="up-add">+ more</div>
                      </div>
                    )}
                  </div>
                  {staged.length > 0 && (
                    <button className="btn sm detail-addimgs" disabled={imgBusy} onClick={addStaged}>
                      {imgBusy ? "Adding…" : `Add ${staged.length} image${staged.length > 1 ? "s" : ""}`}
                    </button>
                  )}
                  <span className="field-hint">The first image is the main one; add more angles or details.</span>
                </div>

                <div className="detail-edit">
                  {EDIT_FIELDS.map((f) => (
                    <div className="field" key={f.key}>
                      <label>{f.label}</label>
                      {f.type === "textarea" ? (
                        <textarea
                          className="textarea"
                          rows={3}
                          value={draft[f.key] ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      ) : f.suggest && (options[f.key as string]?.length ?? 0) > 0 ? (
                        <Combo
                          value={draft[f.key] ?? ""}
                          options={options[f.key as string]}
                          onChange={(val) => setDraft((d) => ({ ...d, [f.key]: val }))}
                        />
                      ) : (
                        <input
                          className="input"
                          value={draft[f.key] ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      )}
                      {f.hint && <span className="field-hint">{f.hint}</span>}
                    </div>
                  ))}
                </div>
                <div className="detail-actions">
                  <button className="btn" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
                  <button className="btn link" disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="detail-head">
                  <h2 className="display">{cur.designer || "Reference"}</h2>
                  {cur.year && <div className="yr">{cur.year}</div>}
                </div>

                {links && links.length > 0 && (
                  <div className="dev-links">
                    <span className="k">In development</span>
                    <span className="v">
                      {links.map((s) => (
                        <Link key={s.id} href={`/styles/${s.id}`} className="dev-link">
                          {s.name}
                          {s.style_no ? ` · ${s.style_no}` : ""}
                        </Link>
                      ))}
                    </span>
                  </div>
                )}

                <div className="detail-rows">
                  {rows.map(([k, v]) =>
                    v ? (
                      <div className="detail-row" key={k}>
                        <span className="k">{k}</span>
                        <span className="v">{v}</span>
                      </div>
                    ) : null
                  )}
                </div>

                {actions !== "read-only" && (
                  <div className="detail-actions">
                    <button className="btn ghost" onClick={beginEdit}>Edit</button>
                    {canDevelop && (
                      <button
                        className={"btn" + (devOpen ? "" : " ghost")}
                        onClick={() => { setDevOpen((o) => !o); setConfirmDel(false); }}
                      >
                        {links && links.length > 0 ? "Development" : "Develop this"}
                      </button>
                    )}
                    {actions === "library" && (
                      <button className="btn" onClick={onAdd}>Add to moodboard</button>
                    )}
                  </div>
                )}

                {devOpen && (
                  <div className="dev-panel">
                    {links === null ? (
                      <div className="dev-empty">Loading…</div>
                    ) : links.length === 0 ? (
                      <div className="dev-empty">
                        Not being developed yet. Start a style from this reference, or link it to one
                        that already exists.
                      </div>
                    ) : (
                      <div className="dev-list">
                        {links.map((s) => {
                          const isArmed = armedUnlink === s.id;
                          return (
                            <div className="dev-row" key={s.id}>
                              <Link href={`/styles/${s.id}`} className="dev-row-name">
                                {s.name}
                              </Link>
                              <span className={"badge " + (s.status === "development" ? "dev" : s.status === "production" ? "prod" : s.status)}>
                                {s.status}
                              </span>
                              <div className="spacer" />
                              <button
                                className={"btn ghost sm" + (isArmed ? " danger" : "")}
                                disabled={devBusy}
                                onClick={() => (isArmed ? unlink(s.id) : setArmedUnlink(s.id))}
                                onBlur={() => setArmedUnlink((a) => (a === s.id ? null : a))}
                                title={isArmed ? "Click again to unlink" : "Unlink this style"}
                              >
                                {isArmed ? "Unlink?" : "Unlink"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button className="btn sm dev-new" disabled={devBusy || pending} onClick={develop}>
                      {devBusy ? "Working…" : "Start a new style from this"}
                    </button>

                    <div className="dev-or">or link to an existing style</div>
                    <input
                      className="input sm"
                      placeholder="Search styles by name or number…"
                      value={pickQ}
                      autoComplete="off"
                      onChange={(e) => setPickQ(e.target.value)}
                    />
                    <div className="dev-picks">
                      {picks.filter((s) => !linkedIds.has(s.id)).length === 0 ? (
                        <div className="dev-empty">
                          {pickQ.trim() ? "No styles match that." : "No other styles yet."}
                        </div>
                      ) : (
                        picks
                          .filter((s) => !linkedIds.has(s.id))
                          .map((s) => (
                            <button
                              key={s.id}
                              className="dev-pick"
                              disabled={devBusy}
                              onClick={() => link(s.id)}
                            >
                              <span>{s.name}{s.style_no ? ` · ${s.style_no}` : ""}</span>
                              <span className="dev-pick-add">Link</span>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {confirmDel && (
                  <div className="detail-confirm">
                    <span>Move this reference to Trash?</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn danger sm" disabled={pending} onClick={del}>{pending ? "…" : "Delete"}</button>
                      <button className="btn link" disabled={pending} onClick={() => setConfirmDel(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* The quiet footer of ways OUT of the reference, kept apart from
                    the row of boxed actions above so the bottom stops feeling
                    busy (Tess, 2026-08-11: "clean up buttons and links towards
                    the bottom so it feels less messy"). View product and Share
                    sit left (Tess, 2026-08-07: "move share down next to view
                    product"); Delete is a quiet danger link pushed to the right
                    — still one click to the confirm, but no longer a loud red
                    box orphaned on its own line among the primary actions.

                    Rendered whenever there is anything to show, so a reference
                    with no product link still has somewhere for Share and Delete
                    to live. */}
                {(cur.link || actions !== "read-only") && (
                  <div className="view-product">
                    {cur.link && (
                      <a href={cur.link} target="_blank" rel="noreferrer">View product ↗</a>
                    )}
                    {actions !== "read-only" && (
                      <button className="btn link" onClick={share}>Share</button>
                    )}
                    {(actions === "library" || actions === "editorial") && (
                      <button
                        className="btn link danger detail-del"
                        onClick={() => { setConfirmDel(true); setDevOpen(false); }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}

                {cur.created_by && <div className="detail-savedby">Saved by {cur.created_by}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
