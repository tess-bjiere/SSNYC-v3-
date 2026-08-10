// The drawer asking the page to open one photograph.
//
// Tess, 2026-08-05: "there should be a small text link to the reference photo
// it's commenting on." A note read in the drawer is half the information — the
// other half is the mark sitting on the seam it is about — so every note in
// there carries a link, and this is what the link does: scroll the picture into
// view and open its viewer, marks and all.
//
// It is the same shape as commentScope.ts, and for the same reason: the drawer
// and the photo cards are in different subtrees of a server component, with no
// parent that could hold this without turning the whole profile into a client
// component. It is a gesture, not state; it survives no reload and needs to.
//
// WITH ONE ADDITION. The previous rounds are unmounted until somebody opens
// them, so a link to a photograph on the 1st proto can land when nothing is
// listening for it. So the request is also PARKED here, and a card checks the
// park when it mounts. The order that produces is: the drawer asks, the history
// opens, the round builds, and the newly built card finds the request waiting
// and answers it. Whoever answers takes it, so it is answered once.

export const PHOTO_FOCUS_EVENT = "ssync:photo-focus";

export type PhotoFocus = {
  /** The round the picture is on, or null for the style's own pictures. */
  sampleId: string | null;
  url: string;
};

let parked: PhotoFocus | null = null;

/** Ask the page to open this photograph. */
export function requestPhotoFocus(focus: PhotoFocus) {
  if (typeof window === "undefined") return;
  parked = { sampleId: focus.sampleId ?? null, url: focus.url };
  window.dispatchEvent(new CustomEvent<PhotoFocus>(PHOTO_FOCUS_EVENT, { detail: parked }));
}

/**
 * Take the parked request if it is mine.
 *
 * `mine` says whether this component holds that picture. Returning true takes
 * the request off the park, so two components holding the same URL — the same
 * file filed in a slot and in the strip — do not both jump.
 */
export function takePhotoFocus(mine: (focus: PhotoFocus) => boolean): PhotoFocus | null {
  if (!parked || !mine(parked)) return null;
  const taken = parked;
  parked = null;
  return taken;
}

/** Where a listener currently is, without taking it. Used to open the history. */
export function peekPhotoFocus(): PhotoFocus | null {
  return parked;
}
