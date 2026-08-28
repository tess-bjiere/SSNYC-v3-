"use client";

import { useEffect, useRef } from "react";
import { markActivitySeen } from "@/app/actions/activity";

// Opening the feed clears the nav badge: stamp "seen" once on mount (Tess,
// 2026-08-26). The list was already rendered with this visit's unread marks, so
// stamping now only affects the badge and the next visit.
export default function MarkSeen() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    markActivitySeen();
  }, []);
  return null;
}
