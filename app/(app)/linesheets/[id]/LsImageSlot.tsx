"use client";

// The linesheet's own upload space for a style's styled photo and croquis (Tess,
// 2026-08-26: "im still missing the space to upload a styled image or croquis on
// the line sheet functionality"). The slots have always existed on the style
// profile's Sketch modal, but the linesheet is where these images are chosen and
// arranged, so the upload belongs here too — a person building the sheet should
// not have to leave it to fill a blank page zone.
//
// It writes straight to the style's photos map through setStylePhoto/clearStylePhoto
// (slot ids "styled", "croquis", "croquis_back"), the same actions the profile
// uses, so an image added here shows on the profile and vice-versa — one source
// of truth, two doors. router.refresh() re-reads the linesheet so the page zone
// fills in at once. The whole control is no-print: it never appears in the export.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStylePhoto, clearStylePhoto } from "@/app/actions/styles";

export default function LsImageSlot({
  styleId,
  slotId,
  label,
  current,
}: {
  styleId: string;
  slotId: string;
  label: string;
  current: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  function upload(file: File) {
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

  return (
    <span className="ls-imgslot">
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
        aria-label={`${current ? "Replace" : "Add"} ${label}`}
      />
      <span className={"ls-imgslot-dot" + (current ? " has" : "")} aria-hidden="true" />
      <span className="ls-imgslot-label">{label}</span>
      <button
        type="button"
        className="btn link sm"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
      >
        {pending ? "…" : current ? "Replace" : "Add"}
      </button>
      {current && (
        <button
          type="button"
          className={"ls-imgslot-x" + (armed ? " armed" : "")}
          disabled={pending}
          onClick={() => (armed ? remove() : setArmed(true))}
          onMouseLeave={() => armed && setArmed(false)}
          title={`Remove ${label}`}
        >
          {armed ? "Remove?" : "×"}
        </button>
      )}
      {error && <span className="ls-imgslot-err">{error}</span>}
    </span>
  );
}
