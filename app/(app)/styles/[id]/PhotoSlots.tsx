"use client";

import { useRef, useState, useTransition } from "react";
import { PHOTO_SLOTS, photoProgressLabel, type PhotoMap } from "@/lib/photoSlots";
import { setStylePhoto, clearStylePhoto } from "@/app/actions/styles";

// The photography standard, rendered (P3 #39).
//
// One card per slot, always all of them, always in standard order — an empty
// card is the shot list. The card shows its shooting note while empty and gets
// out of the way once the shot is in, which is the only way the standard
// actually gets followed on a busy day.
//
// Removing a shot is two clicks, never a browser confirm(): "Remove" arms the
// card and "Remove?" does it. Moving the mouse off the card disarms.
export default function PhotoSlots({ styleId, photos }: { styleId: string; photos: PhotoMap }) {
  const [pending, start] = useTransition();
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [urlOpen, setUrlOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function upload(slotId: string, form: FormData) {
    setError("");
    setBusySlot(slotId);
    start(async () => {
      const res = await setStylePhoto(styleId, slotId, form);
      setBusySlot(null);
      if (!res.ok) setError(res.error || "That didn't save.");
      else setUrlOpen(null);
    });
  }

  function onPick(slotId: string, files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    upload(slotId, fd);
  }

  function remove(slotId: string) {
    setArmed(null);
    setError("");
    setBusySlot(slotId);
    start(async () => {
      await clearStylePhoto(styleId, slotId);
      setBusySlot(null);
    });
  }

  return (
    // Named so the shot list can link straight at it — someone arriving from
    // /photography wants the slots, not the top of the profile.
    <div className="section" id="photography">
      <h3>
        Photography <span className="ph-progress">{photoProgressLabel(photos)}</span>
      </h3>

      {error && <div className="ph-error">{error}</div>}

      <div className="ph-grid">
        {PHOTO_SLOTS.map((slot) => {
          const src = photos[slot.id];
          const busy = busySlot === slot.id && pending;
          return (
            <div
              className={"ph-card" + (src ? " filled" : "")}
              key={slot.id}
              onMouseLeave={() => setArmed((a) => (a === slot.id ? null : a))}
            >
              <div className="ph-frame">
                {src ? (
                  <a href={src} target="_blank" rel="noreferrer" title="Open full size">
                    <img src={src} alt={slot.label} loading="lazy" />
                  </a>
                ) : (
                  <span className="ph-hint">{slot.hint}</span>
                )}
                {busy && <span className="ph-busy">Saving…</span>}
              </div>

              <div className="ph-label">{slot.label}</div>

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
                <button
                  type="button"
                  className="ph-link"
                  disabled={busy}
                  onClick={() => setUrlOpen((u) => (u === slot.id ? null : slot.id))}
                >
                  URL
                </button>
                {src &&
                  (armed === slot.id ? (
                    <button type="button" className="ph-link danger" disabled={busy} onClick={() => remove(slot.id)}>
                      Remove?
                    </button>
                  ) : (
                    <button type="button" className="ph-link" disabled={busy} onClick={() => setArmed(slot.id)}>
                      Remove
                    </button>
                  ))}
              </div>

              {urlOpen === slot.id && (
                <form
                  className="ph-url"
                  action={(fd) => upload(slot.id, fd)}
                >
                  <input className="input sm" name="url" placeholder="Paste an image URL" autoFocus />
                  <button className="btn sm" type="submit" disabled={busy}>
                    Save
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
