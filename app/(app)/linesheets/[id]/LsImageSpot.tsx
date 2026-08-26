"use client";

// A linesheet image *spot* — the place on the page where a styled photo or a
// croquis belongs (Tess, 2026-08-26: "styled photo or croquis go where the
// crosshatched lines are on the left"). The blank crosshatched zone is now the
// upload target itself: click it or drop an image on it and the picture lands
// exactly where it will print. When a picture is already there it shows as it
// prints, with a small Replace / Remove that appears on hover and never prints.
//
// It writes to the style's photos map through setStylePhoto/clearStylePhoto
// (slot ids "styled", "croquis", "croquis_back") — the same slots the profile's
// Sketch modal writes, so an image added here is the style's everywhere, and
// router.refresh() re-reads the sheet so the zone fills in at once.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStylePhoto, clearStylePhoto } from "@/app/actions/styles";

export default function LsImageSpot({
  styleId,
  slotId,
  label,
  url,
  imgClass,
}: {
  styleId: string;
  slotId: string;
  label: string;
  url: string | null;
  /** The class the print/screen CSS sizes the image by (e.g. "ls-hero"). */
  imgClass?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [over, setOver] = useState(false);

  function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("That file isn’t an image.");
      return;
    }
    setError(null);
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const res = await setStylePhoto(styleId, slotId, form);
      if (!res.ok) setError(res.error ?? "That upload didn’t take — try again.");
      else router.refresh();
    });
  }
  function remove() {
    setArmed(false);
    start(async () => {
      await clearStylePhoto(styleId, slotId);
      router.refresh();
    });
  }
  const pick = () => fileRef.current?.click();

  return (
    <div
      className={"ls-imgspot" + (url ? " has" : " empty") + (over ? " over" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) upload(f);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="ls-imgslot-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = ""; // let the same file be re-picked after a remove
        }}
        aria-label={(url ? "Replace " : "Add ") + label}
      />
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={imgClass} src={url} alt={label} />
          <span className="ls-imgspot-tools no-print">
            <button type="button" className="ls-imgspot-btn" onClick={pick} disabled={pending}>
              {pending ? "…" : "Replace"}
            </button>
            <button
              type="button"
              className={"ls-imgspot-btn danger" + (armed ? " armed" : "")}
              disabled={pending}
              onClick={() => (armed ? remove() : setArmed(true))}
              onMouseLeave={() => armed && setArmed(false)}
            >
              {armed ? "Remove?" : "Remove"}
            </button>
          </span>
        </>
      ) : (
        <button
          type="button"
          className="ls-imgspot-add no-print"
          onClick={pick}
          disabled={pending}
          title={"Add " + label}
        >
          <span className="ls-imgspot-plus" aria-hidden="true">＋</span>
          <span className="ls-imgspot-add-label">
            {pending ? "Uploading…" : "Add " + label.toLowerCase()}
          </span>
          <span className="ls-imgspot-hint">click or drop an image</span>
        </button>
      )}
      {error && <span className="ls-imgslot-err no-print">{error}</span>}
    </div>
  );
}
