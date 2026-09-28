"use client";

import { useState } from "react";
import { refImage, type Reference } from "@/lib/types";
import { writeZip } from "@/lib/zip";
import { refImageName, extFromUrl } from "@/lib/imageExport";

// Download a set of references' FULL images as one zip (Tess, 2026-09-28: "how
// do i export a folder of all the images in the reference library?" then "can we
// have the same option on campaign library for export?"). Shared by the
// References and Campaign grids — the only difference is the zip's name.
//
// Everything happens in the browser: the images are public and CORS-open, so
// fetch() can read their bytes; lib/zip.writeZip stitches them stored (no
// re-compression — they are already JPEG/PNG and we want the print originals
// untouched); an <a download> saves the file. Fetched a few at a time so a full
// board is not a one-at-a-time crawl, and named in list order for a stable
// folder. `onToast` reports the result (or an error); `exporting` carries a
// progress count for the button.
export function useImageExport(onToast?: (msg: string) => void, zipPrefix = "SSYNC-references") {
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  async function exportImages(refs: Reference[]) {
    if (exporting) return;
    const targets = refs.filter((r) => refImage(r));
    if (targets.length === 0) {
      onToast?.("No images to download.");
      return;
    }
    setExporting({ done: 0, total: targets.length });
    const fetched: { idx: number; url: string; bytes: Uint8Array }[] = [];
    let failed = 0;
    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= targets.length) return;
        const url = refImage(targets[i]);
        try {
          const res = await fetch(url, { cache: "force-cache" });
          if (!res.ok) throw new Error(String(res.status));
          fetched.push({ idx: i, url, bytes: new Uint8Array(await res.arrayBuffer()) });
        } catch {
          failed++;
        }
        setExporting((e) => (e ? { ...e, done: e.done + 1 } : e));
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker));
      fetched.sort((a, b) => a.idx - b.idx);
      const taken = new Set<string>();
      const files = fetched.map((f) => ({
        name: refImageName(targets[f.idx], extFromUrl(f.url), taken),
        bytes: f.bytes,
      }));
      if (files.length === 0) {
        onToast?.("Couldn’t download any images — check your connection.");
        return;
      }
      // .buffer (a plain ArrayBuffer) rather than the view keeps TS happy about
      // the BlobPart; writeZip returns a fresh zero-offset array, so it's exact.
      const blob = new Blob([writeZip(files).buffer as ArrayBuffer], { type: "application/zip" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${zipPrefix}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 15000);
      onToast?.(
        failed
          ? `Downloaded ${files.length} — ${failed} couldn’t be fetched.`
          : `Downloaded ${files.length} images.`
      );
    } finally {
      setExporting(null);
    }
  }

  return { exporting, exportImages };
}
