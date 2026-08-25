"use client";

/* Tess, 2026-08-24: "remove 'full screen button' and replace with 'review
   latest round' (this would open the full screen view of the most recent
   sample)". A page-level action that opens the current round's full-screen
   review — the same viewer the round card's "Full screen" opens, reached from
   the top of the profile. It fires a window event the sample section listens
   for (see reviewLatest.ts); rendered only when there is a round to review. */

import { requestReviewLatest } from "./reviewLatest";

export default function ReviewLatestButton() {
  return (
    <button type="button" className="btn ghost sm" onClick={requestReviewLatest}>
      Review latest round
    </button>
  );
}
