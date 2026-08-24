import { linkify } from "@/lib/linkify";
import { hasBullets, parseNoteBlocks, type BulletItem } from "@/lib/noteBlocks";

// One line's worth of text, with any URLs in it made clickable — the same
// segment rendering the plain path uses, so a link inside a bullet behaves
// exactly like a link in a paragraph.
function lineNodes(text: string, keyBase: string) {
  return linkify(text).map((seg, i) =>
    seg.kind === "link" ? (
      <a
        key={`${keyBase}-${i}`}
        href={seg.href}
        className="linkified"
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {seg.text}
      </a>
    ) : (
      <span key={`${keyBase}-${i}`}>{seg.text}</span>
    )
  );
}

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
  // Notes that use bullet lines render as paragraphs and (nested) lists (Tess,
  // 2026-08-24: bullets and sub-bullets). Lists are block-level, so this path
  // always uses a <div> — a <ul> inside a <span> is invalid — which is why the
  // plain path below stays exactly as it was for inline (block=false) callers with
  // no bullets.
  if (hasBullets(text)) {
    const blocks = parseNoteBlocks(text);
    const renderList = (items: BulletItem[], key: string) => (
      <ul className="linked-list" key={key}>
        {items.map((item, j) => (
          <li key={j}>
            {lineNodes(item.text, `${key}-${j}`)}
            {item.children.length > 0 && renderList(item.children, `${key}-${j}c`)}
          </li>
        ))}
      </ul>
    );
    return (
      <div className={className}>
        {blocks.map((b, i) =>
          b.kind === "list" ? (
            renderList(b.items, `l${i}`)
          ) : (
            <div key={i} style={{ whiteSpace: "pre-wrap" }}>
              {lineNodes(b.text, `t${i}`)}
            </div>
          )
        )}
      </div>
    );
  }

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
