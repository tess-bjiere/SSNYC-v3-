import test from "node:test";
import assert from "node:assert/strict";
import { linkify, hasLink, type LinkSegment } from "./linkify.ts";

// The property everything else rests on: the linkifier never loses a character.
function rejoin(segs: LinkSegment[]): string {
  return segs.map((s) => s.text).join("");
}

function links(segs: LinkSegment[]) {
  return segs.filter((s) => s.kind === "link") as Extract<LinkSegment, { kind: "link" }>[];
}

test("empty input yields no segments", () => {
  assert.deepEqual(linkify(""), []);
  assert.deepEqual(linkify(null), []);
  assert.deepEqual(linkify(undefined), []);
});

test("plain text with no links is one text segment", () => {
  const segs = linkify("94% cotton, 6% elastane");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].kind, "text");
  assert.equal(rejoin(segs), "94% cotton, 6% elastane");
});

test("a bare https url becomes a link", () => {
  const segs = linkify("https://example.com/tech-pack.pdf");
  assert.equal(links(segs).length, 1);
  assert.equal(links(segs)[0].href, "https://example.com/tech-pack.pdf");
});

test("http is kept as http rather than upgraded", () => {
  // Silently rewriting somebody's scheme breaks internal tools that only serve
  // http. If it does not load, that is information.
  assert.equal(links(linkify("http://factory.local/spec"))[0].href, "http://factory.local/spec");
});

test("a url inside a sentence keeps the sentence around it", () => {
  const segs = linkify("see https://example.com/a for the fit");
  assert.equal(rejoin(segs), "see https://example.com/a for the fit");
  assert.equal(links(segs).length, 1);
  assert.equal(links(segs)[0].text, "https://example.com/a");
});

test("a full stop after a url is not part of the url", () => {
  const segs = linkify("it is at https://example.com/a/b.");
  assert.equal(links(segs)[0].href, "https://example.com/a/b");
  assert.equal(rejoin(segs), "it is at https://example.com/a/b.");
});

test("other sentence punctuation is trimmed too", () => {
  for (const p of [",", ";", ":", "!", "?"]) {
    const segs = linkify(`link https://example.com/x${p} next`);
    assert.equal(links(segs)[0].href, "https://example.com/x", `trailing ${p}`);
    assert.equal(rejoin(segs), `link https://example.com/x${p} next`);
  }
});

test("a closing bracket the url opened itself is kept", () => {
  const segs = linkify("https://en.wikipedia.org/wiki/Dart_(sewing)");
  assert.equal(links(segs)[0].href, "https://en.wikipedia.org/wiki/Dart_(sewing)");
});

test("a closing bracket the url did not open is given back", () => {
  const segs = linkify("(see https://example.com/a)");
  assert.equal(links(segs)[0].href, "https://example.com/a");
  assert.equal(rejoin(segs), "(see https://example.com/a)");
});

test("www without a scheme gets https", () => {
  const segs = linkify("www.example.com/lookbook");
  assert.equal(links(segs)[0].href, "https://www.example.com/lookbook");
  assert.equal(links(segs)[0].text, "www.example.com/lookbook");
});

test("an email address becomes a mailto", () => {
  const segs = linkify("ask sam@factory.it about the trim");
  assert.equal(links(segs)[0].href, "mailto:sam@factory.it");
  assert.equal(links(segs)[0].text, "sam@factory.it");
});

test("an explicit mailto is left alone", () => {
  assert.equal(links(linkify("mailto:sam@factory.it"))[0].href, "mailto:sam@factory.it");
});

test("a bare domain with no scheme and no www is NOT linked", () => {
  // The false-positive case this rule exists for: a missing space after a full
  // stop must not turn two sentences into a link to Italy.
  const segs = linkify("check the sample.it looks short");
  assert.equal(links(segs).length, 0);
  assert.equal(rejoin(segs), "check the sample.it looks short");
});

test("several links in one note are all found", () => {
  const text = "pack https://a.com/p, board www.b.com/x, and mail sam@c.com";
  const segs = linkify(text);
  assert.equal(links(segs).length, 3);
  assert.deepEqual(
    links(segs).map((l) => l.href),
    ["https://a.com/p", "https://www.b.com/x", "mailto:sam@c.com"]
  );
  assert.equal(rejoin(segs), text);
});

test("links across newlines survive, and so do the newlines", () => {
  // Notes are pre-wrap; losing a newline would reflow somebody's paragraph.
  const text = "round 1\nhttps://a.com/one\nround 2\nhttps://a.com/two";
  const segs = linkify(text);
  assert.equal(links(segs).length, 2);
  assert.equal(rejoin(segs), text);
});

test("angle brackets terminate a url rather than being swallowed", () => {
  const segs = linkify("<https://example.com/a>");
  assert.equal(links(segs)[0].href, "https://example.com/a");
  assert.equal(rejoin(segs), "<https://example.com/a>");
});

test("no href is ever javascript:", () => {
  // The whole point of returning segments instead of HTML. Nothing that is not
  // http/https/mailto can come out of this function.
  const nasty = "javascript:alert(1) data:text/html,<script>x</script> vbscript:x";
  for (const l of links(linkify(nasty))) {
    assert.match(l.href, /^(https?:\/\/|mailto:)/, `unsafe href: ${l.href}`);
  }
});

test("text is never re-ordered or duplicated", () => {
  const samples = [
    "https://a.com",
    "a https://b.com c",
    "https://a.com https://b.com",
    "no links at all",
    "trailing dot https://a.com.",
    "  leading and trailing space  ",
    "sam@c.com, jo@d.com",
  ];
  for (const s of samples) assert.equal(rejoin(linkify(s)), s, s);
});

test("hasLink is a cheap yes/no", () => {
  assert.equal(hasLink("see https://a.com"), true);
  assert.equal(hasLink("94% cotton"), false);
  assert.equal(hasLink(null), false);
});
