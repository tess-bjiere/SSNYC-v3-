"use client";

import { useEffect } from "react";

// A larger view for an image (Tess, 2026-08-20: "ability to view image in a
// larger view"). A full-screen overlay showing one image big; Escape or a click
// on the backdrop closes it, and when several are passed the arrows page through
// them. Reusable — the same viewer serves every grid in the tool.
export default function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const many = images.length > 1;
  const at = Math.max(0, Math.min(index, images.length - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowRight") onIndex((at + 1) % images.length);
      else if (many && e.key === "ArrowLeft") onIndex((at - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [at, images.length, many, onIndex, onClose]);

  if (!images.length) return null;

  return (
    <div className="lb-overlay" onClick={onClose}>
      <button type="button" className="lb-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {many && (
        <button
          type="button"
          className="lb-nav lb-prev"
          aria-label="Previous"
          onClick={(e) => { e.stopPropagation(); onIndex((at - 1 + images.length) % images.length); }}
        >
          ‹
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lb-img" src={images[at]} alt="" onClick={(e) => e.stopPropagation()} />
      {many && (
        <>
          <button
            type="button"
            className="lb-nav lb-next"
            aria-label="Next"
            onClick={(e) => { e.stopPropagation(); onIndex((at + 1) % images.length); }}
          >
            ›
          </button>
          <div className="lb-count">{at + 1} / {images.length}</div>
        </>
      )}
    </div>
  );
}
