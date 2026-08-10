// A round card asking the comments drawer to open on that round.
//
// The two live in different subtrees of a server component — SampleRounds is
// rendered inside the profile column, CommentsDrawer is a sibling of the whole
// profile — so there is no parent to hold the state without turning the page
// into a client component or threading a context provider around everything it
// renders. Neither is worth it for one string.
//
// So: a window event. It is a UI gesture, not application state; it survives no
// reload and needs to. The listener is the drawer and the only dispatcher is a
// round card, both in this folder, so the coupling is visible from here.

export const SCOPE_EVENT = "ssync:comment-scope";

/** "general", "all", or a sample round's id. */
export type ScopeRequest = string;

export function requestCommentScope(scope: ScopeRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ScopeRequest>(SCOPE_EVENT, { detail: scope }));
}
