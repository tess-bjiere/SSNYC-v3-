"use client";

import { useEffect, useRef, useState } from "react";
import type { MBImageItem } from "@/lib/moodboard";
import { refImage, type Reference } from "@/lib/types";

// Faithful, read-only render of a board's canvas: every image sits at its real
// (x, y) with its stored width, preserving the arrangement exactly. Scales to fit
// the available width. (Drag-to-arrange + pan/zoom come in Round 2.)
export default function Canvas({
  images,
  refs,
}: {
  images: MBImageItem[];
  refs: Record<string, Reference>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Canvas bounds from the items (estimate heights at a 3:4 ratio for layout).
  const pad = 40;
  const canvasW =
    Math.max(320, ...images.map((i) => (i.x || 0) + (i.w || 180))) + pad;
  const canvasH =
    Math.max(320, ...images.map((i) => (i.y || 0) + (i.w || 180) * 1.34)) + pad;

  useEffect(() => {
    function fit() {
      const w = wrapRef.current?.clientWidth ?? canvasW;
      setScale(Math.min(1, w / canvasW));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [canvasW]);

  return (
    <div ref={wrapRef} style={{ width: "100%", overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          width: canvasW,
          height: canvasH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          marginBottom: (scale - 1) * canvasH, // reclaim space freed by scaling
        }}
      >
        {images.map((img) => {
          const ref = refs[img.ref_id];
          const src = ref ? refImage(ref) : "";
          if (!src) return null;
          return (
            <img
              key={img.iid}
              src={src}
              alt={ref?.designer || ""}
              loading="lazy"
              title={[ref?.designer, ref?.garment, ref?.color].filter(Boolean).join(" · ")}
              style={{
                position: "absolute",
                left: img.x || 0,
                top: img.y || 0,
                width: img.w || 180,
                height: "auto",
                display: "block",
                boxShadow: "0 2px 10px rgba(0,0,0,.35)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
