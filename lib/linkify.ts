/**
 * Plain text with URLs in it, split into segments so a renderer can make the
 * URLs clickable.
 *
 * Tess, 2026-08-04: "Make links in notes hyperlink." Half of what gets pasted
 * into a comment or a material note is a link — a tech pack, a Drive folder, a
 * supplier page, a WeTransfer that expires — and every one of them was landing
 * as dead text that somebody had to select and copy by hand.
 *
 * This does the *finding* only. It returns segments and never returns HTML, so
 * nothing here can inject markup: the caller renders text segments as text and
 * link segments as <a>, and React escapes both. There is no dangerouslySetInner-
 * HTML anywhere downstream and this file is the reason there does not need to be.
 *
 * What counts as a link:
 *
 *   http:// and https://    the real case
 *   www.something.tld       what people actually paste out of a browser bar
 *   host.tld/path           a schemeless link that still carries a path
 *   mailto: / bare email    a supplier contact in a note is a link worth having
 *
 * Bare host with a path IS matched: a schemeless "docs.google.com/deck" fires,
 * because Tess, 2026-08-11, pastes Google Docs links without the https:// and
 * they were landing as dead text ("urls dropped into notes dont hyperlink").
 * The guard is the path — a bare host only counts once a "/" follows the TLD.
 *
 * Bare host with NO path is still deliberately NOT matched. "94% cotton, 6%
 * elastane" is fine, and a sentence like "check the sample.it looks short" must
 * not turn "sample.it" into a link to Italy. A missed link is an annoyance; a
 * wrong link in a factory note is a phone call — and requiring the slash keeps
 * the wrong ones out while catching the real pasted URLs, which carry a path.
 *
 * Trailing punctuation is trimmed off the match rather than swallowed, because
 * people write "see https://x.com/a/b." and the full stop is a full stop. The
 * exception is a closing bracket that has a matching opener inside the URL —
 * Wikipedia-style paths really do end in ")".
 *
 * Dependency-free on purpose: unit-tested directly by node's test runner.
 */

export type LinkSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

// One pass, three alternatives, ordered longest-prefix first so "https://" is
// never matched as the shorter "www." rule.
const PATTERN =
  /(https?:\/\/[^\s<>]+)|(www\.[^\s<>]+)|(mailto:[^\s<>]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\/[^\s<>]*)/g;

/** Punctuation that ends a sentence rather than a URL. */
const TRAILING = new Set([".", ",", ";", ":", "!", "?", "'", '"', "”", "’", "»"]);

const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Trim punctuation that belongs to the sentence, not the link.
 *
 * Returns how many characters to give back to the surrounding text, so the
 * caller can keep them rather than dropping them — a full stop that vanishes
 * from a note is a worse bug than a link that did not fire.
 */
function trimTrailing(raw: string): string {
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1];
    if (TRAILING.has(ch)) {
      end--;
      continue;
    }
    const opener = CLOSERS[ch];
    if (opener) {
      // Keep the bracket only if the URL opened one itself.
      const inner = raw.slice(0, end);
      const opens = inner.split(opener).length - 1;
      const closes = inner.split(ch).length - 1;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return raw.slice(0, end);
}

/** The href a segment should point at, given the shape it was written in. */
function hrefFor(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^mailto:/i.test(raw)) return raw;
  // No scheme: an "@" makes it an email, anything else is a bare host — www.x
  // or a schemeless "docs.google.com/deck" — and both want https.
  if (raw.includes("@")) return "mailto:" + raw;
  return "https://" + raw;
}

/**
 * Split text into renderable segments.
 *
 * Always returns at least one segment for non-empty input, and joining every
 * segment's `text` back together reproduces the input exactly — that round-trip
 * is the property the tests lean on, because it is the one that guarantees no
 * character of somebody's note is ever lost to the linkifier.
 */
export function linkify(input: string | null | undefined): LinkSegment[] {
  const text = typeof input === "string" ? input : "";
  if (!text) return [];

  const out: LinkSegment[] = [];
  let cursor = 0;

  PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(text)) !== null) {
    const start = m.index;
    const matched = m[0];
    const kept = trimTrailing(matched);

    // Nothing survived the trim — treat it as ordinary text and move on.
    if (!kept) continue;

    if (start > cursor) out.push({ kind: "text", text: text.slice(cursor, start) });
    out.push({ kind: "link", text: kept, href: hrefFor(kept) });
    cursor = start + kept.length;

    // The regex may have consumed punctuation we just handed back; rewind so
    // the next search starts where the link actually ended.
    PATTERN.lastIndex = cursor;
  }

  if (cursor < text.length) out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}

/** True if there is at least one link in the text. Cheap check for a badge. */
export function hasLink(input: string | null | undefined): boolean {
  return linkify(input).some((s) => s.kind === "link");
}
