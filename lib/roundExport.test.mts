import { test } from "node:test";
import assert from "node:assert/strict";
import {
  styleLabel,
  buildRoundDoc,
  renderRoundText,
  roundSubject,
  roundFilename,
  mailtoLink,
  missingLine,
  MAILTO_LIMIT,
  type RoundExportInput,
} from "./roundExport.ts";

// What these tests are actually protecting, in order of how much it would cost
// to get wrong:
//
//   1. A section quietly disappearing when it is empty. That is the failure that
//      loses a hem: a factory reading a document with no Fit heading assumes the
//      fit was fine. Empty sections no longer print — four headings apologising
//      for themselves was the redundancy Tess asked to be rid of — so what these
//      tests now hold onto is the closing line that names every one of them.
//      Nothing may go missing without being named.
//   2. The ETA still being printed after the sample has landed, so the factory
//      has two dates to argue about.
//   3. A mailto body being silently truncated by the mail client, dropping the
//      photograph links off the end with nobody the wiser.

function input(over: Partial<RoundExportInput> = {}): RoundExportInput {
  return {
    styleName: "Anorak Jacket",
    roundLabel: "2nd Proto",
    generatedOn: "2026-08-05",
    ...over,
  };
}

test("styleLabel: name alone, name + number, name + number + season", () => {
  assert.equal(styleLabel(input()), "Anorak Jacket");
  assert.equal(styleLabel(input({ styleNo: "SS-1042" })), "Anorak Jacket (SS-1042)");
  assert.equal(
    styleLabel(input({ styleNo: "SS-1042", season: "SS27" })),
    "Anorak Jacket (SS-1042, SS27)"
  );
  assert.equal(styleLabel(input({ season: "SS27" })), "Anorak Jacket (SS27)");
});

test("styleLabel: a nameless style is still named something", () => {
  assert.equal(styleLabel(input({ styleName: "   " })), "Untitled");
});

test("an empty round prints no sections at all, and names every one of them", () => {
  const doc = buildRoundDoc(input());
  assert.deepEqual(doc.sections, []);
  assert.deepEqual(doc.missing, [
    "Round",
    "Raw material",
    "Fit notes",
    "Factory comments",
    "Photographs",
  ]);
  // Nothing has gone quiet: the text still says what is not there.
  const text = renderRoundText(doc);
  assert.ok(text.includes("Not recorded: round, raw material, fit notes, factory comments and photographs."));
});

test("blank-but-present strings count as empty, not as content", () => {
  const doc = buildRoundDoc(input({ fitNotes: "   \n  ", factoryComments: "" }));
  assert.equal(doc.sections.find((s) => s.heading === "Fit notes"), undefined);
  assert.ok(doc.missing.includes("Fit notes"));
});

test("missingLine reads as a sentence at one, two and many", () => {
  assert.equal(missingLine([]), "");
  assert.equal(missingLine(["Fit notes"]), "Not recorded: fit notes.");
  assert.equal(
    missingLine(["Fit notes", "Photographs"]),
    "Not recorded: fit notes and photographs."
  );
  assert.equal(
    missingLine(["Round", "Fit notes", "Photographs"]),
    "Not recorded: round, fit notes and photographs."
  );
});

test("the ETA prints while the sample is out and disappears once it lands", () => {
  const out = buildRoundDoc(input({ etaDate: "2026-09-01" }));
  const round = out.sections.find((s) => s.heading === "Round")!;
  assert.ok(round.lines.some((l) => l.startsWith("Sample ETA:")));

  const landed = buildRoundDoc(input({ etaDate: "2026-09-01", receivedDate: "2026-08-28" }));
  const round2 = landed.sections.find((s) => s.heading === "Round")!;
  assert.ok(!round2.lines.some((l) => l.startsWith("Sample ETA:")));
  assert.ok(round2.lines.some((l) => l === "Sample received: 2026-08-28"));
});

test("the round section keeps its facts in reading order, and drops the four internal ones", () => {
  const doc = buildRoundDoc(
    input({
      factory: "Perla",
      contactName: "Ana",
      status: "Needs to fit",
      location: "Office",
      rating: "Good",
      requestedDate: "2026-07-01",
      receivedDate: "2026-07-28",
    })
  );
  const round = doc.sections.find((s) => s.heading === "Round")!;
  // No "Contact: Ana" — she is the person the mail is addressed to. No
  // "Current location: Office" — that is where the studio keeps the garment.
  // No status and no rating — the studio's bookkeeping about its own process,
  // not a fact about the sample the factory made.
  assert.deepEqual(round.lines, [
    "Factory: Perla",
    "Sample requested: 2026-07-01",
    "Sample received: 2026-07-28",
  ]);
  assert.equal(round.empty, false);
});

test("neither the fitting status nor the rating reaches the factory", () => {
  // "Notes sent to factory" tells the factory what it is already holding, and a
  // one-word verdict above a list of corrections either contradicts the list or
  // softens it. Both are still accepted on the input — this checks they stay in.
  const doc = buildRoundDoc(
    input({ status: "Notes sent to factory", rating: "Good", fitNotes: "Sleeve 1cm long." })
  );
  const text = renderRoundText(doc);
  assert.ok(!text.includes("Notes sent to factory"));
  assert.ok(!text.includes("How it came out"));
  assert.ok(!text.includes("Good"));
  assert.ok(text.includes("Sleeve 1cm long."));
});

test("the contact name is nowhere in the document", () => {
  const doc = buildRoundDoc(input({ contactName: "Ana", location: "Office", factory: "Perla" }));
  const text = renderRoundText(doc);
  assert.ok(!text.includes("Ana"));
  assert.ok(!text.includes("Office"));
});

test("the contact email never appears in the document body", () => {
  // It addresses the mail; printing it in a document that gets forwarded is a
  // way of leaking somebody's address to whoever it lands with next.
  const doc = buildRoundDoc(input({ contactEmail: "ana@perla.example" }));
  assert.ok(!renderRoundText(doc).includes("ana@perla.example"));
});

test("photographs print label, note and URL; unlabelled ones still print", () => {
  const doc = buildRoundDoc(
    input({
      images: [
        { url: "https://x/1.jpg", label: "Model front", note: "hem is short" },
        { url: "https://x/2.jpg", label: "" },
        { url: "   ", label: "dropped — no url" },
      ],
    })
  );
  const photos = doc.sections.find((s) => s.heading === "Photographs")!;
  assert.equal(photos.empty, false);
  assert.equal(photos.lines.length, 2);
  assert.equal(photos.lines[0], "Model front — hem is short\nhttps://x/1.jpg");
  assert.equal(photos.lines[1], "Image\nhttps://x/2.jpg");
  // And an image with no URL is not carried on the doc either.
  assert.equal(doc.images.length, 2);
});

test("renderRoundText: headings upper-cased, one trailing newline, no runaway blanks", () => {
  const text = renderRoundText(buildRoundDoc(input()));
  assert.ok(text.startsWith("2nd Proto — Anorak Jacket\n"));
  assert.ok(text.includes("Not recorded:"));
  assert.ok(text.endsWith("\n"));
  assert.ok(!text.endsWith("\n\n"));
});

test("subtitle carries the passed-in date, and nothing reads the clock", () => {
  const doc = buildRoundDoc(input({ generatedOn: "1999-01-01" }));
  assert.equal(doc.subtitle, "Sample round notes · 1999-01-01");
  assert.equal(doc.generatedOn, "1999-01-01");
});

test("roundSubject leads with the style so a factory inbox can sort it", () => {
  assert.equal(
    roundSubject(input({ styleNo: "SS-1042", season: "SS27" })),
    "Anorak Jacket (SS-1042, SS27) — 2nd Proto notes"
  );
});

test("roundFilename slugs, prefers the style number, and never comes back empty", () => {
  assert.equal(roundFilename(input({ styleNo: "SS-1042" })), "ss-1042-2nd-proto-notes.txt");
  assert.equal(roundFilename(input()), "anorak-jacket-2nd-proto-notes.txt");
  assert.equal(
    roundFilename({ styleName: "…", roundLabel: "———", generatedOn: "2026-08-05" }),
    "sample-round-notes.txt"
  );
});

test("mailtoLink: short body goes through whole and round-trips", () => {
  const link = mailtoLink("ana@perla.example", "Subject here", "line one\nline two");
  assert.ok(link.startsWith("mailto:ana%40perla.example?subject="));
  const body = decodeURIComponent(link.split("&body=")[1]);
  assert.equal(body, "line one\nline two");
});

test("mailtoLink: an empty address still produces a usable link", () => {
  const link = mailtoLink("", "S", "B");
  assert.ok(link.startsWith("mailto:?subject=S&body=B"));
  const link2 = mailtoLink(null, "S", "B");
  assert.equal(link2, link);
});

test("mailtoLink: a long body is cut at a line boundary and says that it was", () => {
  const body = Array.from({ length: 200 }, (_, i) => `photograph ${i} https://x/${i}.jpg`).join("\n");
  const link = mailtoLink("ana@perla.example", "Subject", body);
  assert.ok(link.length <= MAILTO_LIMIT);

  const cut = decodeURIComponent(link.split("&body=")[1]);
  assert.ok(cut.includes("[Cut short here"));
  // Cut on a line boundary: no half a URL left dangling.
  const lines = cut.split("\n").filter((l) => l.startsWith("photograph "));
  assert.ok(lines.length > 0);
  assert.ok(lines.every((l) => /^photograph \d+ https:\/\/x\/\d+\.jpg$/.test(l)));
  // And it is a genuine prefix of the real document, not a reshuffle.
  assert.ok(body.startsWith(lines.join("\n")));
});

test("mailtoLink: the cut respects a caller-supplied limit too", () => {
  const body = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
  const link = mailtoLink("a@b.c", "S", body, 300);
  assert.ok(link.length <= 300);
  assert.ok(decodeURIComponent(link.split("&body=")[1]).includes("[Cut short here"));
});

test("mailtoLink: a limit smaller than the header does not throw or produce garbage", () => {
  const link = mailtoLink("someone@somewhere.example", "A fairly long subject line", "body", 10);
  assert.ok(link.includes("&body="));
  // Nothing survivable fits, but it is still a well-formed mailto.
  assert.ok(link.startsWith("mailto:someone%40somewhere.example?subject="));
});

test("a full round renders end to end with no section missing", () => {
  const doc = buildRoundDoc(
    input({
      styleNo: "SS-1042",
      season: "SS27",
      factory: "Perla",
      contactName: "Ana",
      contactEmail: "ana@perla.example",
      status: "Notes sent to factory",
      location: "Factory",
      requestedDate: "2026-07-01",
      receivedDate: "2026-07-28",
      materialType: "Cotton twill",
      materialContents: "100% cotton",
      materialSupplier: "Sanko",
      materialNotes: "Second dye lot runs warm.",
      fitNotes: "Sleeve 1cm long.",
      factoryComments: "Can hold the hem tape.",
      images: [{ url: "https://x/1.jpg", label: "Model front" }],
    })
  );
  assert.deepEqual(doc.missing, []);
  const text = renderRoundText(doc);
  for (const h of ["ROUND", "RAW MATERIAL", "FIT NOTES", "FACTORY COMMENTS", "PHOTOGRAPHS"]) {
    assert.ok(text.includes(h), `missing ${h}`);
  }
  // A complete round has nothing to apologise for, so the line is absent.
  assert.ok(!text.includes("Not recorded:"));
});
