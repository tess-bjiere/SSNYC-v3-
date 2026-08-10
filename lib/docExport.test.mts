import test from "node:test";
import assert from "node:assert/strict";

import { asDocFilename, wordDocument, WORD_MIME } from "./docExport.ts";

test("the document carries the marker Word and Docs look for", () => {
  const html = wordDocument("<h1>Hi</h1>", "Thing");
  assert.match(html, /schemas-microsoft-com:office:word/);
  assert.match(html, /<w:WordDocument>/);
});

test("the body is placed inside, untouched", () => {
  const html = wordDocument("<h1>SS-100</h1><p>Notes</p>", "SS-100");
  assert.ok(html.includes("<h1>SS-100</h1><p>Notes</p>"));
});

test("the title is escaped, so a style name with an ampersand cannot break the head", () => {
  const html = wordDocument("<p>x</p>", "Black & Tan <Jacket>");
  assert.match(html, /<title>Black &amp; Tan &lt;Jacket&gt;<\/title>/);
});

test("print styles travel in the file rather than through a clipboard", () => {
  const html = wordDocument("<p>x</p>", "t");
  assert.match(html, /@page/);
  assert.match(html, /border-collapse/);
  // The on-screen controls must not print into the document.
  assert.match(html, /\.no-print \{ display: none; \}/);
});

test("the mime type is the one every word processor accepts", () => {
  assert.equal(WORD_MIME, "application/msword");
});

test("asDocFilename swaps the extension and keeps the studio's naming", () => {
  assert.equal(asDocFilename("SS-100 2nd Proto 2026-08-06.txt"), "SS-100 2nd Proto 2026-08-06.doc");
  assert.equal(asDocFilename("notes.md"), "notes.doc");
  assert.equal(asDocFilename("notes.html"), "notes.doc");
  assert.equal(asDocFilename("notes"), "notes.doc");
});

test("asDocFilename does not double up an extension it already has", () => {
  assert.equal(asDocFilename("brief.doc"), "brief.doc");
  assert.equal(asDocFilename("brief.docx"), "brief.doc");
});

test("an empty filename still names the file something openable", () => {
  assert.equal(asDocFilename(""), "export.doc");
  assert.equal(asDocFilename("   "), "export.doc");
});

test("a dot inside the name is not mistaken for an extension", () => {
  assert.equal(asDocFilename("SS-100 v1.2 notes.txt"), "SS-100 v1.2 notes.doc");
});
