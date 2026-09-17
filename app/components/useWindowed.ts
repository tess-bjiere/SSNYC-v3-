"use client";

import { useEffect, useRef, useState } from "react";

// Render a long grid in chunks instead of all at once (Tess, 2026-09-17: "ssync
// app feels slow"). The References and Campaign grids were rendering every card
// — ~120 of them on a full board — plus streaming every thumbnail on each visit,
// which is what made the page take seconds to settle. This shows `page` cards,
// then grows by `page` whenever a sentinel near the bottom scrolls into view, so
// the DOM and the image loads stay bounded while the grid still reads as one
// continuous scroll (no "load more" button to click).
//
// `items` must be a STABLE reference between renders (the callers pass a
// useMemo'd list) — the window resets to the first page whenever it changes, so
// applying a filter starts you back at the top rather than deep in a long list.
//
// The observer is rebuilt on every count change: an IntersectionObserver fires
// its callback immediately when it starts observing an element that is already
// in view, so re-observing after each grow keeps loading until the sentinel is
// finally out of range or the list is exhausted — the chunk-load version of the
// classic "sentinel stays intersecting so it never re-fires" problem.
export function useWindowed<T>(items: T[], page = 48) {
  const [count, setCount] = useState(page);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const len = items.length;

  // Reset to the first page only when the RESULT-SET SIZE changes (a filter was
  // applied) — NOT on every render. The callers pass a useMemo'd list, but its
  // identity still changes whenever the component re-renders for another reason
  // (e.g. the window itself growing), and depending on that identity pinned the
  // window at the first page and stopped it growing. `len` is a stable
  // primitive, and scrolling only changes `count`, so this never fires mid-scroll.
  const prevLen = useRef(len);
  useEffect(() => {
    if (prevLen.current !== len) {
      prevLen.current = len;
      setCount(page);
    }
  }, [len, page]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || count >= len) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setCount((c) => Math.min(c + page, len));
      },
      { rootMargin: "800px 0px" }
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [count, len, page]);

  const shown = count >= len ? items : items.slice(0, count);
  return { shown, sentinelRef, hasMore: count < len };
}
