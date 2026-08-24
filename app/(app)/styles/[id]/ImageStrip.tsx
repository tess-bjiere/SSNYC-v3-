"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { type ListImage, GALLERY_KEY, COLORWAYS_KEY, SHOTS_KEY } from "@/lib/imageList";
import type { ImageNote } from "@/lib/imageNotes";
import { EMPTY_NOTE } from "@/lib/imageNotes";
import ImageNotes from "./ImageNotes";
import ImageCropper, { type CropRect } from "@/app/components/ImageCropper";
import { PHOTO_FOCUS_EVENT, takePhotoFocus } from "./photoFocus";
import {
  cropStyleImage,
  cropSampleImage,
  addStyleImage,
  removeStyleImage,
  captionStyleImage,
  moveStyleImage,
  addSampleShot,
  removeSampleShot,
  captionSampleShot,
  moveSampleShot,
  addStyleColorway,
  removeStyleColorway,
  captionStyleColorway,
  moveStyleColorway,
} from "@/app/actions/styles";

// An ordered list of images, with uploads (P3 refinements).
//
// Used in two places and deliberately the same component in both:
//
//   the style       every other picture of the garment beyond the five fixed
//                   photography slots
//   a sample round  what actually arrived in this round
//
// Which one it is is decided by whether a sampleId was passed. The two sets of
// server actions have identical shapes, so the only difference at this level is
// four function names — and the person using it sees exactly the same controls
// in both places, which is the point.
//
// Order matters (the first image is the one anyone looks at), so it is editable
// — with two arrows rather than drag and drop, because half of this is done on a
// phone standing next to a rail.
//
// Removing is two clicks and never a browser confirm(): "Remove" arms the tile
// and "Remove?" does it. Moving the pointer off the tile disarms it. The stored
// file is left in the bucket either way.

export default function ImageStrip({
  styleId,
  sampleId = null,
  list = "gallery",
  images,
  title,
  hint,
  addLabel = "Add image",
  notes,
}: {
  styleId: string;
  sampleId?: string | null;
  /**
   * Which list on the style this strip edits. Ignored when a sampleId is
   * passed, because a round only has one.
   *
   * A name, not a jsonb key: the four server actions are chosen from it below,
   * so nothing the client sends can name a key to write. The photography slots
   * live in the same map as these lists.
   */
  list?: "gallery" | "colorways";
  images: ListImage[];
  title?: string;
  hint?: string;
  addLabel?: string;
  /**
   * Marks written on these pictures, keyed by image URL (lib/imageNotes.ts).
   *
   * Only the marks. The caption of a list image is stored on the list entry and
   * always has been, so the annotator's own caption box is switched off here —
   * two boxes for one sentence is worse than either.
   */
  notes?: Record<string, ImageNote>;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [captioning, setCaptioning] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  // Owned here rather than in the viewer — see SlotCards: the viewer remounts
  // on every arrow press, so full size has to be held by whoever owns the list.
  const [full, setFull] = useState(false);
  const [error, setError] = useState("");
  // Highlighted while an image is being dragged over the strip.
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Which tile holds which picture, in a ref so the listener below registers
  // once rather than on every render.
  const bySrc = useRef<Record<string, string>>({});
  bySrc.current = {};
  for (const im of images) bySrc.current[im.url] = im.id;

  // A note in the comments drawer asking for its photograph (photoFocus.ts).
  // Checked on mount too: a strip inside the closed previous-rounds history
  // does not exist when the link is pressed, and the request waits for it.
  useEffect(() => {
    function answer() {
      const focus = takePhotoFocus(
        (f) => (f.sampleId ?? null) === (sampleId ?? null) && !!bySrc.current[f.url]
      );
      if (!focus) return;
      const imageId = bySrc.current[focus.url];
      setFull(false);
      setNoteOpen(imageId);
      requestAnimationFrame(() =>
        tileRefs.current[imageId]?.scrollIntoView({ behavior: "smooth", block: "center" })
      );
    }
    answer();
    window.addEventListener(PHOTO_FOCUS_EVENT, answer);
    return () => window.removeEventListener(PHOTO_FOCUS_EVENT, answer);
  }, [sampleId]);

  const working = busy && pending;

  function add(form: FormData) {
    setError("");
    setBusy(true);
    start(async () => {
      const res = sampleId
        ? await addSampleShot(styleId, sampleId, form)
        : list === "colorways"
          ? await addStyleColorway(styleId, form)
          : await addStyleImage(styleId, form);
      setBusy(false);
      if (!res.ok) setError(res.error || "That didn't save.");
    });
  }

  // Only a file drag arms the drop — dragging text or a link over the strip
  // should do nothing, and its dataTransfer carries no "Files" type.
  function isFileDrag(e: { dataTransfer: DataTransfer }): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }

  function onPick(files: FileList | null) {
    // Named `picked` rather than `list`, which is the prop naming which list
    // on the style this strip edits.
    const picked = Array.from(files ?? []);
    if (!picked.length) return;
    setError("");
    setBusy(true);
    // Multiple files land as a sequence of single uploads rather than one big
    // request: the body-size ceiling is per request, and one oversized picture
    // in a selection of eight should not lose the other seven.
    start(async () => {
      for (const f of picked) {
        const fd = new FormData();
        fd.set("file", f);
        const res = sampleId
          ? await addSampleShot(styleId, sampleId, fd)
          : list === "colorways"
            ? await addStyleColorway(styleId, fd)
            : await addStyleImage(styleId, fd);
        if (!res.ok) {
          setError(res.error || "That didn't save.");
          break;
        }
      }
      setBusy(false);
    });
  }

  function remove(id: string) {
    setArmed(null);
    setError("");
    setBusy(true);
    start(async () => {
      if (sampleId) await removeSampleShot(styleId, sampleId, id);
      else if (list === "colorways") await removeStyleColorway(styleId, id);
      else await removeStyleImage(styleId, id);
      setBusy(false);
    });
  }

  function move(id: string, delta: number) {
    setError("");
    setBusy(true);
    start(async () => {
      if (sampleId) await moveSampleShot(styleId, sampleId, id, delta);
      else if (list === "colorways") await moveStyleColorway(styleId, id, delta);
      else await moveStyleImage(styleId, id, delta);
      setBusy(false);
    });
  }

  function caption(id: string, form: FormData) {
    setError("");
    setBusy(true);
    start(async () => {
      if (sampleId) await captionSampleShot(styleId, sampleId, id, form);
      else if (list === "colorways") await captionStyleColorway(styleId, id, form);
      else await captionStyleImage(styleId, id, form);
      setBusy(false);
      setCaptioning(null);
    });
  }

  // Crop one image in place (Tess, 2026-08-24). The list key is resolved the same
  // way the add/remove actions above resolve theirs, so nothing the client sends
  // names a jsonb key; the server validates it again.
  const [cropId, setCropId] = useState<string | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const cropSrc = images.find((im) => im.id === cropId)?.url ?? null;
  function applyCrop(rect: CropRect) {
    const id = cropId;
    if (!id) return;
    setCropBusy(true);
    setError("");
    start(async () => {
      const target = {
        listKey: sampleId ? SHOTS_KEY : list === "colorways" ? COLORWAYS_KEY : GALLERY_KEY,
        imageId: id,
      };
      const res = sampleId
        ? await cropSampleImage(styleId, sampleId, target, rect)
        : await cropStyleImage(styleId, target, rect);
      setCropBusy(false);
      setCropId(null);
      if (!res.ok) setError(res.error || "Couldn't crop that image.");
    });
  }

  return (
    <div
      className={"img-strip" + (dragging ? " dragging" : "")}
      // Drop images anywhere on the strip to add them — no need to find the
      // button (Tess, 2026-08-17: "you should be able to drag images in to
      // upload in the samples"). The strip already takes a whole batch at once,
      // so a drop of several lands as several, in order.
      onDragOver={(e) => {
        if (working || !isFileDrag(e)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDragging(false);
        onPick(e.dataTransfer.files);
      }}
    >
      {(title || hint) && (
        <div className="img-strip-head">
          {title && <span className="l">{title}</span>}
          {images.length > 0 && (
            <span className="n">
              {images.length} {images.length === 1 ? "image" : "images"}
            </span>
          )}
          {hint && images.length === 0 && <span className="h">{hint}</span>}
        </div>
      )}

      {error && <div className="ph-error">{error}</div>}

      {images.length > 0 && (
        <div className="img-tiles">
          {images.map((im, i) => {
            const note = notes?.[im.url] || EMPTY_NOTE;
            return (
            <Fragment key={im.id}>
            <div
              className="img-tile"
              ref={(el) => {
                tileRefs.current[im.id] = el;
              }}
              onMouseLeave={() => setArmed((a) => (a === im.id ? null : a))}
            >
              {/* The picture opens its own notes, not a new browser tab
                  (Tess, 2026-08-05: "when you click into photo you should be
                  able to see comments / text / mark-ups"). The raw file is
                  still one click away, from "Original file" in the viewer, and
                  "Full size" now fills the window WITH the marks on it. */}
              <button
                type="button"
                className="img-open"
                title="Open notes and mark-ups"
                onClick={() => setNoteOpen(im.id)}
              >
                <img src={im.url} alt={im.caption || `Image ${i + 1}`} loading="lazy" />
              </button>

              {im.caption && !(captioning === im.id) && <div className="img-cap">{im.caption}</div>}

              {captioning === im.id ? (
                <form className="img-capform" action={(fd) => caption(im.id, fd)}>
                  <input
                    className="input sm"
                    name="caption"
                    defaultValue={im.caption}
                    placeholder="What is this?"
                    autoFocus
                  />
                  <button className="btn sm" type="submit" disabled={working}>
                    Save
                  </button>
                </form>
              ) : (
                <div className="img-tools">
                  <button
                    type="button"
                    className="ph-link"
                    disabled={working || i === 0}
                    title="Move earlier"
                    onClick={() => move(im.id, -1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="ph-link"
                    disabled={working || i === images.length - 1}
                    title="Move later"
                    onClick={() => move(im.id, 1)}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="ph-link"
                    disabled={working}
                    onClick={() => setCaptioning(im.id)}
                  >
                    {im.caption ? "Edit caption" : "Caption"}
                  </button>
                  <button
                    type="button"
                    className="ph-link"
                    disabled={working}
                    onClick={() => setCropId(im.id)}
                  >
                    Crop
                  </button>
                  <button
                    type="button"
                    className="ph-link"
                    disabled={working}
                    onClick={() => setNoteOpen((n) => (n === im.id ? null : im.id))}
                  >
                    {noteOpen === im.id
                      ? "Close notes"
                      : note.pins.length
                        ? `${note.pins.length} mark${note.pins.length === 1 ? "" : "s"}`
                        : "Mark up"}
                  </button>
                  {armed === im.id ? (
                    <button
                      type="button"
                      className="ph-link danger"
                      disabled={working}
                      onClick={() => remove(im.id)}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ph-link"
                      disabled={working}
                      onClick={() => setArmed(im.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* A row in the grid, not an overlay — the enlarged picture opens
                directly under its own tile and the rest of the strip stays
                where it is. */}
            {noteOpen === im.id && (
              <ImageNotes
                styleId={styleId}
                sampleId={sampleId}
                url={im.url}
                label={im.caption || `Image ${i + 1}`}
                note={note}
                caption={false}
                position={`${i + 1} of ${images.length}`}
                full={full}
                onFull={setFull}
                onPrev={i > 0 ? () => setNoteOpen(images[i - 1].id) : null}
                onNext={i < images.length - 1 ? () => setNoteOpen(images[i + 1].id) : null}
                onClose={() => {
                  setFull(false);
                  setNoteOpen(null);
                }}
              />
            )}
            </Fragment>
            );
          })}
        </div>
      )}

      <div className="img-add">
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          ref={fileRef}
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn ghost sm"
          disabled={working}
          onClick={() => fileRef.current?.click()}
        >
          {working ? "Uploading…" : addLabel}
        </button>
        {/* No "URL" button, for the same reason as on the slot cards
            (Tess, 2026-08-05: "remove url option from photos upload"):
            pictures arrive as files. The server action still accepts a url
            field, so nothing stored this way is affected and the control can
            return if it is ever asked for. */}
      </div>

      {cropId && cropSrc && (
        <ImageCropper
          src={cropSrc}
          title="Crop image"
          busy={cropBusy}
          onApply={applyCrop}
          onCancel={() => setCropId(null)}
        />
      )}
    </div>
  );
}
