"use client";

import { useEffect } from "react";

// App-segment error boundary (Tess, 2026-09-15: uploading images to a campaign
// profile showed "Application error: a client-side exception has occurred while
// loading"). The app had NO error boundary, so ANY client render error fell
// through to Next's bare crash page — a dead black screen.
//
// The most common cause is not a code bug at all: after a new deploy, a tab that
// was opened against the OLD build reaches for a code chunk whose hashed filename
// the new build has replaced, and the fetch 404s (a ChunkLoadError). A reload
// pulls the current build and the error is gone. So a chunk/deploy error reloads
// itself once (guarded against a loop); anything else shows a quiet, recoverable
// message with a Reload button instead of crashing the whole page.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunk = /ChunkLoadError|Loading chunk|error loading dynamically imported module|Importing a module script failed|failed to fetch dynamically/i.test(
    `${error?.name ?? ""} ${error?.message ?? ""}`
  );

  useEffect(() => {
    if (!isChunk || typeof window === "undefined") return;
    // Reload to fetch the current build — but not more than once every 10s, so a
    // genuinely persistent error can't spin the page in a reload loop.
    try {
      const now = Date.now();
      const last = Number(sessionStorage.getItem("ssync_chunk_reload") || 0);
      if (now - last > 10000) {
        sessionStorage.setItem("ssync_chunk_reload", String(now));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [isChunk]);

  return (
    <div className="page">
      <div className="empty" style={{ maxWidth: 460, margin: "80px auto", textAlign: "center" }}>
        <p style={{ marginBottom: 16 }}>
          {isChunk ? "The app just updated — reloading…" : "Something went wrong on this page."}
        </p>
        <button className="btn" onClick={() => reset()}>
          Reload
        </button>
      </div>
    </div>
  );
}
