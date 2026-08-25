// The page-head "Review latest round" button asking the sample section to open
// the most recent round in the full-screen review.
//
// Tess, 2026-08-24: "remove 'full screen button' and replace with 'review latest
// round' (this would open the full screen view of the most recent sample)".
//
// Same shape and reason as photoFocus.ts / commentScope.ts: the button sits in
// the page head and the round cards are in a different subtree of a server
// component, with no shared parent that could hold this without turning the
// whole profile into a client component. It is a gesture, not state — a click
// that opens a viewer — so a window event carries it and nothing is persisted.
//
// No parking is needed here, unlike photoFocus: the current round's card is
// always mounted (the history is what folds away), so there is always a
// listener when the button fires.

export const REVIEW_LATEST_EVENT = "ssync:review-latest";

/** Ask the sample section to open the latest round full screen. */
export function requestReviewLatest() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REVIEW_LATEST_EVENT));
}
