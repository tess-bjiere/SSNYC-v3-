import { linkify } from "@/lib/linkify";
import { parseRich, type RichNode } from "@/lib/richNote";
import Linked from "./Linked";

// Renders a stored note (Tess, 2026-08-24: "go with TipTap"). A rich note is a
// TipTap doc, drawn here by WALKING THE JSON INTO REACT ELEMENTS — never
// dangerouslySetInnerHTML — so there is no HTML-injection path and no sanitizer
// needed; the worst a note can contain is text, a list, and bold/italic. A note
// that is still plain text (everything written before the editor) falls straight
// through to <Linked>, so every old note renders exactly as it always has.
//
// URLs inside a note stay clickable the same way they do in a plain note: the
// text of each node is run through lib/linkify, the identical path <Linked> uses,
// so a tech-pack link behaves the same in a rich note and an old one.

const MARK_TAG: Record<string, "strong" | "em" | "s" | "code"> = {
  bold: "strong",
  italic: "em",
  strike: "s",
  code: "code",
};

/** One text node: its URLs made links, then wrapped by whatever marks it carries. */
function renderText(node: RichNode, key: string): React.ReactNode {
  let nodes: React.ReactNode = linkify(node.text ?? "").map((seg, i) =>
    seg.kind === "link" ? (
      <a
        key={`${key}-${i}`}
        href={seg.href}
        className="linkified"
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {seg.text}
      </a>
    ) : (
      <span key={`${key}-${i}`}>{seg.text}</span>
    )
  );
  for (const mark of node.marks ?? []) {
    const Tag = MARK_TAG[mark.type];
    if (Tag) nodes = <Tag key={`${key}-${mark.type}`}>{nodes}</Tag>;
  }
  return nodes;
}

/** The inline children of a block (text nodes and line breaks). */
function renderInline(nodes: RichNode[] | undefined, key: string): React.ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    if (n.type === "text") return <span key={`${key}-${i}`}>{renderText(n, `${key}-${i}`)}</span>;
    if (n.type === "hardBreak") return <br key={`${key}-${i}`} />;
    return null;
  });
}

function isList(t: string): boolean {
  return t === "bulletList" || t === "orderedList";
}

function renderItems(items: RichNode[] | undefined, key: string): React.ReactNode {
  return (items ?? []).map((li, i) => {
    const k = `${key}-li${i}`;
    const kids = (li.content ?? []).map((c, j) => {
      const ck = `${k}-${j}`;
      if (c.type === "paragraph") {
        const inline = renderInline(c.content, ck);
        return (
          <span className="rich-li-text" key={ck}>
            {inline.length ? inline : " "}
          </span>
        );
      }
      if (isList(c.type)) {
        const Tag = c.type === "orderedList" ? "ol" : "ul";
        return (
          <Tag className="rich-list" key={ck}>
            {renderItems(c.content, ck)}
          </Tag>
        );
      }
      return null;
    });
    return <li key={k}>{kids}</li>;
  });
}

function renderBlocks(nodes: RichNode[] | undefined, key: string): React.ReactNode {
  return (nodes ?? []).map((n, i) => {
    const k = `${key}-${i}`;
    if (n.type === "paragraph") {
      const inline = renderInline(n.content, k);
      return (
        <p className="rich-p" key={k}>
          {inline.length ? inline : <br />}
        </p>
      );
    }
    if (isList(n.type)) {
      const Tag = n.type === "orderedList" ? "ol" : "ul";
      return (
        <Tag className="rich-list" key={k}>
          {renderItems(n.content, k)}
        </Tag>
      );
    }
    return null;
  });
}

export default function RichNote({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const doc = parseRich(value);
  // Plain-text notes (everything pre-TipTap) render through the old path unchanged.
  if (!doc) return <Linked className={className} text={value} />;
  return <div className={"rich-note" + (className ? " " + className : "")}>{renderBlocks(doc.content, "n")}</div>;
}
