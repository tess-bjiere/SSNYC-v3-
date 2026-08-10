import { linkify } from "@/lib/linkify";

// Text that somebody typed, with the URLs in it made clickable.
//
// Tess, 2026-08-04: "Make links in notes hyperlink."
//
// Used everywhere a person writes free text — comments and replies, fit notes,
// material notes, factory comments, style notes. One component so a link
// behaves identically in all of them, rather than four near-copies that drift.
//
// No "use client": this has no state and no handlers, so it renders on the
// server inside a server component and comes along quietly into the bundle when
// a client component imports it. Both callers exist.
//
// Safety: lib/linkify.ts returns *segments*, never HTML, and this file renders
// them as ordinary React children — so the text goes through React's escaping
// like any other string, and there is no dangerouslySetInnerHTML anywhere in
// this path. A link's href can only ever be http, https or mailto; a
// `javascript:` URL pasted into a comment stays inert text. That is asserted in
// lib/linkify.test.mts rather than trusted.
//
// whiteSpace: pre-wrap by default, because these are notes: somebody's line
// breaks are part of what they wrote.

export default function Linked({
  text,
  className,
  block = true,
}: {
  text: string | null | undefined;
  className?: string;
  /** false renders an inline <span> — for a note that sits inside a line. */
  block?: boolean;
}) {
  const segments = linkify(text);
  if (segments.length === 0) return null;

  const children = segments.map((seg, i) =>
    seg.kind === "link" ? (
      <a
        key={i}
        href={seg.href}
        className="linkified"
        target="_blank"
        // noreferrer as well as noopener: a tech pack link should not tell the
        // other end which style profile it was clicked from.
        rel="noopener noreferrer nofollow"
      >
        {seg.text}
      </a>
    ) : (
      <span key={i}>{seg.text}</span>
    )
  );

  const style = { whiteSpace: "pre-wrap" as const };
  return block ? (
    <div className={className} style={style}>
      {children}
    </div>
  ) : (
    <span className={className} style={style}>
      {children}
    </span>
  );
}
