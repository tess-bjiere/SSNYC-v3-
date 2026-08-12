"use client";

import { useState } from "react";
import { toPng } from "html-to-image";

// Exports the board (#mb-capture) as a PNG. To avoid cross-origin canvas tainting
// from external reference images, each image is temporarily swapped to the app's
// same-origin /api/img proxy, captured, then restored.
export default function ExportButton({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);

  async function exportPng() {
    const el = document.getElementById("mb-capture");
    if (!el) return;
    setBusy(true);

    const imgs = Array.from(el.querySelectorAll("img"));
    const originals = imgs.map((im) => im.getAttribute("src") || "");

    // App chrome that is meaningful on screen but not in a shared image — today
    // just the "in development" tags — is hidden for the duration of the capture.
    el.classList.add("exporting");

    try {
      // Swap to proxy + wait for all to (re)load.
      await Promise.all(
        imgs.map(
          (im, i) =>
            new Promise<void>((resolve) => {
              const orig = originals[i];
              if (!orig || orig.startsWith("data:")) return resolve();
              im.crossOrigin = "anonymous";
              const done = () => resolve();
              im.onload = done;
              im.onerror = done;
              im.setAttribute("src", `/api/img?url=${encodeURIComponent(orig)}`);
            })
        )
      );

      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#0c0c0c",
        cacheBust: true,
      });

      const a = document.createElement("a");
      a.download = `${(name || "moodboard").replace(/[^\w-]+/g, "-")}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      alert("Export failed — some images may not have loaded. Try again.");
      console.error(e);
    } finally {
      el.classList.remove("exporting");
      // Restore original srcs.
      imgs.forEach((im, i) => {
        im.onload = null;
        im.onerror = null;
        im.removeAttribute("crossorigin");
        im.setAttribute("src", originals[i]);
      });
      setBusy(false);
    }
  }

  return (
    <button className="btn link mb-export" onClick={exportPng} disabled={busy}>
      {busy ? "Exporting…" : "Export PNG"}
    </button>
  );
}
