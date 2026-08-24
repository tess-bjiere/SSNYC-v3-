"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import type { PhotoSlot, PhotoMap } from "@/lib/photoSlots";
import { visibleSlots } from "@/lib/photoSlots";
import type { ImageNote } from "@/lib/imageNotes";
import { EMPTY_NOTE, noteCountLabel } from "@/lib/imageNotes";
import ImageNotes from "./ImageNotes";
import ImageCropper, { type CropRect } from "@/app/components/ImageCropper";
import { PHOTO_FOCUS_EVENT, takePhotoFocus } from "./photoFocus";
import {
  setStylePhoto,
  clearStylePhoto,
  setSamplePhoto,
  clearSamplePhoto,
  cropStyleImage,
  cropSampleImage,
} from "@/app/actions/styles";

// The grid of fixed, named image slots.
//
// Split out of PhotoSlots so the same card can serve two lists that are not the
// same thing: the five photography slots (the shoot standard) and the design
// slots (the sketch). One is an output of a photo session, the other is an input
// to development — but a card that holds one named image is a card that holds
// one named image, and there is no reason for two of them.
//
// One card per slot, always all of them, always in the order given. An empty
// card IS the list of what is still needed, which is the only way the standard
// gets followed on a busy day.
//
// Removing is two clicks, never a browser confirm(): "Remove" arms the card,
// "Remove?" does it, and moving the pointer off the card disarms it.
//
// It now serves a third list as well: the five photography slots on a sample
// round (Tess, 2026-08-05: "photography should not be it's own section, it
// needs to live within the specific sample round"). Passing a sampleId points
// every write at that round instead of at the style. The card is identical
// either way — which is the reason it was split out in the first place — so
// there is exactly one place where uploading, pasting a URL and the two-click
// remove are implemented, and no chance of the round version drifting into
// behaving differently from the style version.
//
// Each filled card also carries what has been written about that picture — the
// caption under the label, and a button that opens the marks on the photograph
// itself (Tess, 2026-08-05: "you should be able to add text comments to each
// image as well as notate on the images"). The annotator opens as a full-width
// row inside this same grid rather than as an overlay, so the big version of
// the picture appears directly underneath its own card.
export default function SlotCards({
  styleId,
  sampleId,
  photos,
  slots,
  notes,
  comments = true,
}: {
  styleId: string;
  /** When set, the slots belong to this sample round rather than to the style. */
  sampleId?: string;
  photos: PhotoMap;
  slots: readonly PhotoSlot[];
  /**
   * Everything written about these pictures, keyed by image URL.
   *
   * Keyed by URL and not by slot on purpose: replacing a lay-flat with a
   * re-shoot has to give a clean picture, not five old marks describing a fault
   * that was corrected. See lib/imageNotes.ts.
   */
  notes?: Record<string, ImageNote>;
  /**
   * Whether to offer the fit-comments button on a filled card.
   *
   * On for photography slots and for a round's shots. Off for the sketch (Tess,
   * 2026-08-07), where a comment about how something fitted would be filed
   * against the drawing rather than against the sample that fitted that way.
   * Existing marks are unaffected either way — this hides an invitation, not a
   * record.
   */
  comments?: boolean;
}) {
  const [pending, start] = useTransition();
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  // Full size is owned here, not inside the viewer: moving to the next picture
  // remounts the viewer, so a flag kept in there would drop out of full size on
  // every arrow press.
  const [full, setFull] = useState(false);
  const [error, setError] = useState("");
  // Which card an image is being dragged over, for the drop highlight.
  const [dragSlot, setDragSlot] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Which slot holds which picture, kept in a ref so the listener below can be
  // registered once instead of being torn down and rebuilt on every render.
  const bySrc = useRef<Record<string, string>>({});
  bySrc.current = {};
  for (const s of slots) if (photos[s.id]) bySrc.current[photos[s.id]] = s.id;

  // A note in the comments drawer asking for its photograph (photoFocus.ts).
  // Checked on mount as well as on the event, because a card inside the closed
  // previous-rounds history does not exist yet when the link is pressed — the
  // request waits on the park and this is where it gets collected.
  useEffect(() => {
    function answer() {
      const focus = takePhotoFocus(
        (f) => (f.sampleId ?? null) === (sampleId ?? null) && !!bySrc.current[f.url]
      );
      if (!focus) return;
      const slotId = bySrc.current[focus.url];
      setFull(false);
      setNoteOpen(slotId);
      // After the viewer has been laid out, so the scroll lands on the picture
      // and not on where the picture used to be.
      requestAnimationFrame(() =>
        cardRefs.current[slotId]?.scrollIntoView({ behavior: "smooth", block: "center" })
      );
    }
    answer();
    window.addEventListener(PHOTO_FOCUS_EVENT, answer);
    return () => window.removeEventListener(PHOTO_FOCUS_EVENT, answer);
  }, [sampleId]);

  function upload(slotId: string, form: FormData) {
    setError("");
    setBusySlot(slotId);
    start(async () => {
      const res = sampleId
        ? await setSamplePhoto(styleId, sampleId, slotId, form)
        : await setStylePhoto(styleId, slotId, form);
      setBusySlot(null);
      if (!res.ok) setError(res.error || "That didn't save.");
    });
  }

  function onPick(slotId: string, files: FileList | null) {
    // A slot holds one picture, so a drop of several fills it with the first —
    // the rest belong in the "Anything else" strip, which takes a whole batch.
    const f = files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    upload(slotId, fd);
  }

  // Only a file drag arms the drop — dragging selected text or a link over a
  // card should do nothing, and its dataTransfer carries no "Files" type.
  function isFileDrag(e: { dataTransfer: DataTransfer }): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }

  function remove(slotId: string) {
    setArmed(null);
    setError("");
    setBusySlot(slotId);
    start(async () => {
      if (sampleId) await clearSamplePhoto(styleId, sampleId, slotId);
      else await clearStylePhoto(styleId, slotId);
      setBusySlot(null);
    });
  }

  // Crop a slot's picture in place (Tess, 2026-08-24: "Add ability to crop images
  // loaded into style profile or samples"). The cropper reports a rectangle; the
  // pixels are cut server-side and the slot's URL is swapped, so its caption and
  // marks (keyed by the new URL after a re-shoot anyway) and the rest of the
  // photos map are untouched. The revalidate flows the new picture back in.
  const [cropSlot, setCropSlot] = useState<string | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  function applyCrop(rect: CropRect) {
    const slotId = cropSlot;
    if (!slotId) return;
    setCropBusy(true);
    setError("");
    start(async () => {
      const res = sampleId
        ? await cropSampleImage(styleId, sampleId, { slot: slotId }, rect)
        : await cropStyleImage(styleId, { slot: slotId }, rect);
      setCropBusy(false);
      setCropSlot(null);
      if (!res.ok) setError(res.error || "Couldn't crop that image.");
    });
  }

  // The cards to draw: every required slot, every optional slot with a picture
  // on it, and one spare per family (Tess, 2026-08-05: "have 4 detail shots and
  // 2 then 2 layflat shots"). The full eleven exist in the standard; showing
  // all eleven at once on a round with two photographs on it would be nine
  // blank boxes. See lib/photoSlots.ts.
  const cards = visibleSlots(slots, photos);

  // What the arrows in the viewer walk through: the slots that actually hold a
  // photograph, in standard order. Empty slots are skipped — arriving at a card
  // with nothing on it is not "the next picture", it is a dead end you have to
  // press through, and on a half-shot round most of them would be.
  const shot = slots.filter((s) => photos[s.id]);
  const at = noteOpen ? shot.findIndex((s) => s.id === noteOpen) : -1;

  return (
    <>
      {error && <div className="ph-error">{error}</div>}

      {/* Two slots get half the row each rather than two thirds of it, so a
          front/back pair reads as a pair — side by side, same size, the way
          they will be looked at. */}
      <div className={"ph-grid" + (cards.length === 1 ? " one" : cards.length === 2 ? " two" : "")}>
        {cards.map((slot) => {
          const src = photos[slot.id];
          const busy = busySlot === slot.id && pending;
          const note = (src && notes?.[src]) || EMPTY_NOTE;
          const noteLabel = noteCountLabel(note);
          return (
            <Fragment key={slot.id}>
            <div
              className={
                "ph-card" + (src ? " filled" : "") + (dragSlot === slot.id ? " drag" : "")
              }
              ref={(el) => {
                cardRefs.current[slot.id] = el;
              }}
              onMouseLeave={() => setArmed((a) => (a === slot.id ? null : a))}
              // Drag an image onto a card to fill it — the same act as Upload,
              // without hunting for the button (Tess, 2026-08-17: "you should be
              // able to drag images in to upload in the samples"). A drop on a
              // filled card replaces, exactly like Upload does.
              onDragOver={(e) => {
                if (busy || !isFileDrag(e)) return;
                e.preventDefault();
                setDragSlot(slot.id);
              }}
              onDragLeave={(e) => {
                // Ignore the leave fired while crossing a child element — only a
                // pointer that has actually left the card clears the highlight.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragSlot((d) => (d === slot.id ? null : d));
                }
              }}
              onDrop={(e) => {
                if (!isFileDrag(e)) return;
                e.preventDefault();
                setDragSlot(null);
                onPick(slot.id, e.dataTransfer.files);
              }}
            >
              <div className="ph-frame">
                {src ? (
                  // Clicking the picture opens what has been written about it,
                  // not the raw file in another tab (Tess, 2026-08-05: "when
                  // you click into photo you should be able to see comments /
                  // text / mark-ups"). The original file is still there, from
                  // "Original file" inside the viewer — as is a full-size view
                  // that keeps the marks on the picture.
                  <button
                    type="button"
                    className="ph-open"
                    title="Open notes and mark-ups"
                    onClick={() => {
                      setNoteOpen(slot.id);
                      // On a phone the notes open as a full modal you page
                      // through, image and notes together, rather than expanding
                      // inline (Tess, 2026-08-11: "click ... a sample thumbnail
                      // ... should open up a modal that shows images and notes
                      // and allows you to click to next image / note"). Desktop
                      // keeps the inline view under the picture.
                      setFull(window.matchMedia("(max-width: 860px)").matches);
                    }}
                  >
                    <img src={src} alt={slot.label} loading="lazy" />
                  </button>
                ) : (
                  <span className="ph-hint">{slot.hint}</span>
                )}
                {busy && <span className="ph-busy">Saving…</span>}
              </div>

              <div className="ph-label">
                {slot.label}
                {/* The detail shots no longer wear an "Optional" tag (Tess,
                    2026-08-17: "remove optional from detail shot labels"). It
                    was desk furniture that only added noise to the tiles, and a
                    detail card that is offered at all is one somebody can fill
                    or leave — the tag was telling them what the empty card
                    already says. Kept for any future optional slot outside the
                    detail family; there are none today. */}
                {slot.optional && slot.group !== "detail" && (
                  <span className="ph-opt">Optional</span>
                )}
              </div>

              {/* What the picture is, if anybody said. Under the name, above
                  the controls — the same place the gallery puts it. */}
              {note.caption && <div className="img-cap">{note.caption}</div>}

              <div className="ph-actions">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  ref={(el) => {
                    fileRefs.current[slot.id] = el;
                  }}
                  onChange={(e) => {
                    onPick(slot.id, e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={busy}
                  onClick={() => fileRefs.current[slot.id]?.click()}
                >
                  {src ? "Replace" : "Upload"}
                </button>
                {src && (
                  <button
                    type="button"
                    className="ph-link"
                    disabled={busy}
                    onClick={() => setCropSlot(slot.id)}
                  >
                    Crop
                  </button>
                )}
                {/* The "URL" button used to sit here (Tess, 2026-08-05:
                    "remove url option from photos upload"). Uploading is the
                    gesture everyone actually uses — a photograph starts life
                    as a file on a phone or a laptop, not as a link — and a
                    second way to do it made the card busier than the job.
                    Nothing was removed underneath: the server action still
                    takes a `url` field and still stores it, so a paste-a-link
                    control can come back as one button if it is ever wanted,
                    and every image already filed by URL is untouched. */}
                {/* Off on the sketch (Tess, 2026-08-07: "remove fit comments
                    on the sketch profile uploads"), on everywhere else.

                    A sketch is the drawing of what the garment is MEANT to be.
                    A fit comment is about what actually arrived, and it belongs
                    on the round that arrived — which already carries fit notes
                    of its own and lets every photograph be marked up. Inviting
                    one on the drawing puts fit history in two places and splits
                    it.

                    Only the button is hidden. Anything already written on a
                    sketch is still stored, still read and still shown by the
                    annotator; nothing was deleted to do this. */}
                {src && comments && (
                  <button
                    type="button"
                    className="ph-link"
                    disabled={busy}
                    onClick={() => setNoteOpen((n) => (n === slot.id ? null : slot.id))}
                  >
                    {noteOpen === slot.id ? "Close" : noteLabel || "Fit comments"}
                  </button>
                )}
                {src &&
                  (armed === slot.id ? (
                    <button
                      type="button"
                      className="ph-link danger"
                      disabled={busy}
                      onClick={() => remove(slot.id)}
                    >
                      Remove?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ph-link"
                      disabled={busy}
                      onClick={() => setArmed(slot.id)}
                    >
                      Remove
                    </button>
                  ))}
              </div>

            </div>

            {/* Outside the card and inside the grid, so it can span every
                column. A modal would have been less code and worse: this way
                the marks sit under the picture they belong to, the rest of the
                shoot is still on screen, and nothing has to be dismissed to
                look at the next slot. */}
            {src && noteOpen === slot.id && (
              <ImageNotes
                styleId={styleId}
                sampleId={sampleId ?? null}
                url={src}
                label={slot.label}
                note={note}
                position={`${at + 1} of ${shot.length}`}
                full={full}
                onFull={(v) => {
                  setFull(v);
                  // On a phone, Done (exit full) closes back to the thumbnails
                  // rather than dropping to the inline image below the thumbnail
                  // (Tess, 2026-08-11: "when you click done on a full size sample
                  // image, it should go back to just the thumbnails").
                  if (!v && window.matchMedia("(max-width: 860px)").matches) setNoteOpen(null);
                }}
                // No caption on a sample photo — the slot label already says what
                // the picture is (Tess, 2026-08-11: "remove caption for sample
                // photos"). Design slots (no sampleId) keep it.
                caption={!sampleId}
                onPrev={at > 0 ? () => setNoteOpen(shot[at - 1].id) : null}
                onNext={at >= 0 && at < shot.length - 1 ? () => setNoteOpen(shot[at + 1].id) : null}
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

      {cropSlot && photos[cropSlot] && (
        <ImageCropper
          src={photos[cropSlot]}
          title="Crop image"
          busy={cropBusy}
          onApply={applyCrop}
          onCancel={() => setCropSlot(null)}
        />
      )}
    </>
  );
}
