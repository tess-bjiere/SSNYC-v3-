"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A normalized crop rectangle — every value 0..1, relative to the image's own
 *  box, so it is resolution-independent and the server can apply it with sharp. */
export type CropRect = { x: number; y: number; w: number; h: number };

type Drag = {
  mode: "move" | "nw" | "ne" | "sw" | "se";
  startX: number;
  startY: number;
  startRect: CropRect;
};

const MIN = 0.06; // smallest crop, as a fraction — stops a box collapsing to nothing
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// A crop tool (Tess, 2026-08-20: "add ability to crop images in the tool" — scope
// "All uploads + re-crop"). It only ever computes geometry: the user drags a box,
// and `onApply` gets a normalized rectangle. The actual pixels are cut server-side
// with sharp, so there is no canvas, no cross-origin taint, and the same tool
// serves a freshly-chosen file (shown from a blob URL) and an existing stored
// image (shown from its URL) without caring which it is.
export default function ImageCropper({
  src,
  title,
  busy,
  skipLabel,
  onSkip,
  onCancel,
  onApply,
}: {
  src: string;
  title?: string;
  busy?: boolean;
  // When cropping on upload, "use as-is" leaves the image uncropped and moves on;
  // omitted when re-cropping an existing image (there is nothing to skip to).
  skipLabel?: string;
  onSkip?: () => void;
  onCancel: () => void;
  onApply: (rect: CropRect) => void;
}) {
  // Start on a centred box covering most of the image — the common case is
  // trimming edges, not a tiny detail.
  const [rect, setRect] = useState<CropRect>({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);

  const onDown = (mode: Drag["mode"]) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect };
  };

  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    const el = boxRef.current;
    if (!d || !el) return;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const dx = (e.clientX - d.startX) / box.width;
    const dy = (e.clientY - d.startY) / box.height;
    const r = { ...d.startRect };
    if (d.mode === "move") {
      r.x = clamp01(d.startRect.x + dx);
      r.y = clamp01(d.startRect.y + dy);
      // Keep the whole box on the image when moving.
      r.x = Math.min(r.x, 1 - r.w);
      r.y = Math.min(r.y, 1 - r.h);
    } else {
      const right = d.startRect.x + d.startRect.w;
      const bottom = d.startRect.y + d.startRect.h;
      if (d.mode === "nw" || d.mode === "sw") {
        const nx = clamp01(Math.min(d.startRect.x + dx, right - MIN));
        r.x = nx;
        r.w = right - nx;
      }
      if (d.mode === "ne" || d.mode === "se") {
        r.w = Math.max(MIN, Math.min(d.startRect.w + dx, 1 - d.startRect.x));
      }
      if (d.mode === "nw" || d.mode === "ne") {
        const ny = clamp01(Math.min(d.startRect.y + dy, bottom - MIN));
        r.y = ny;
        r.h = bottom - ny;
      }
      if (d.mode === "sw" || d.mode === "se") {
        r.h = Math.max(MIN, Math.min(d.startRect.h + dy, 1 - d.startRect.y));
      }
    }
    setRect(r);
  }, []);

  useEffect(() => {
    const up = () => (drag.current = null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      document.body.style.overflow = "";
    };
  }, [onMove]);

  const pct = (n: number) => `${n * 100}%`;
  const handles: Drag["mode"][] = ["nw", "ne", "sw", "se"];

  return (
    <div className="crop-overlay" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="crop-modal">
        <div className="crop-head">
          <span>{title || "Crop image"}</span>
          <button type="button" className="notes-close" onClick={onCancel} title="Close" disabled={busy}>
            ×
          </button>
        </div>
        <div className="crop-stage">
          <div className="crop-imgbox" ref={boxRef}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="crop-img" src={src} alt="" draggable={false} />
            {/* Dim everything outside the box with four masks, so what stays is obvious. */}
            <div className="crop-shade crop-top" style={{ height: pct(rect.y) }} />
            <div
              className="crop-shade crop-bottom"
              style={{ top: pct(rect.y + rect.h), height: pct(1 - rect.y - rect.h) }}
            />
            <div
              className="crop-shade crop-left"
              style={{ top: pct(rect.y), height: pct(rect.h), width: pct(rect.x) }}
            />
            <div
              className="crop-shade crop-right"
              style={{ top: pct(rect.y), height: pct(rect.h), left: pct(rect.x + rect.w), width: pct(1 - rect.x - rect.w) }}
            />
            <div
              className="crop-box"
              style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
              onPointerDown={onDown("move")}
            >
              {handles.map((h) => (
                <span key={h} className={"crop-handle crop-" + h} onPointerDown={onDown(h)} />
              ))}
            </div>
          </div>
        </div>
        <div className="crop-tools">
          <button type="button" className="btn" disabled={busy} onClick={() => onApply(rect)}>
            {busy ? "Cropping…" : "Apply crop"}
          </button>
          {onSkip && (
            <button type="button" className="btn ghost" onClick={onSkip} disabled={busy}>
              {skipLabel || "Use as-is"}
            </button>
          )}
          <button type="button" className="ph-link" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
