import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStyleDoc,
  isEmptySection,
  referenceLabel,
  renderDocText,
  styleSubtitle,
  exportFilename,
  type ExportInput,
} from "./styleExport.ts";

const STYLE = {
  name: "Cropped Rib Tank",
  style_no: "SS-1042",
  category: "Tops",
  garment: "Tank",
  designer: "In-house",
  season: "SS27",
  factory: "Sunrise Mills",
  status: "production",
  evergreen: true,
  notes: "Developed from a library reference: Margiela — 1990s.",
  fit_notes: "Runs long through the body.\nStill needs 1cm off the front rise.",
  created_by: "tess@theloyalist.com",
  created_at: "2026-03-02T10:00:00Z",
};

const FULL: ExportInput = {
  style: STYLE,
  references: [{ designer: "Margiela", year: "1998", garment: "Tank" }],
  samples: [
    {
      round: "proto1",
      factory: "Sunrise Mills",
      status: "received",
      material_supplier: "Ito",
      material_ordered_date: "2026-03-05",
      submitted_date: "2026-03-20",
      received_date: "2026-04-02",
      fit_notes: "Armhole tight.",
      comments: "Asked for 1cm at the side seam.",
    },
    { round: "proto2", submitted_date: "2026-04-20" },
  ],
  photos: [
    { label: "Model — front", url: "https://cdn/a.jpg" },
    { label: "Model — back", url: null },
  ],
  versions: [
    { version_no: 2, changes: "New colorway — sage", created_at: "2026-05-01T00:00:00Z" },
    { version_no: 1, changes: "First pattern", created_at: "2026-03-02T00:00:00Z" },
  ],
  comments: [
    { body: "Second look please", author: "kara@", created_at: "2026-05-04T00:00:00Z", status: "open" },
    { body: "Approved", author: "gabby@", created_at: "2026-04-03T00:00:00Z", status: "received" },
  ],
  generatedOn: "2026-08-04",
};

const BARE: ExportInput = { style: { name: "Bare Style" }, generatedOn: "2026-08-04" };

test("the subtitle says what the style is in the studio's own terms", () => {
  assert.equal(styleSubtitle(STYLE), "SS-1042 · SS27 · Tank · Sunrise Mills");
  assert.equal(styleSubtitle({ name: "x" }), "");
});

test("every section is present even when there is nothing in it", () => {
  const doc = buildStyleDoc(BARE);
  const titles = doc.sections.map((s) => s.title);
  assert.deepEqual(titles, [
    "Details",
    "Fit",
    "Developed from",
    "Sample cycle",
    "Photography",
    "Versions",
    "Comments & feedback",
  ]);
  // A document that silently omits a heading reads as "nothing to report" when
  // it means "nothing was recorded".
  for (const s of doc.sections) {
    if (isEmptySection(s)) assert.ok(s.empty.length > 0, `${s.title} needs an empty line`);
  }
});

test("an empty style still renders as a readable document", () => {
  const text = renderDocText(buildStyleDoc(BARE));
  assert.ok(text.startsWith("Bare Style\n"));
  assert.ok(text.includes("No sample rounds logged yet."));
  assert.ok(text.includes("No fit notes recorded"));
  assert.ok(text.includes("0 sample rounds · 0 versions · 0 comments."));
});

test("blank fields are left out of a row list rather than printed as dashes", () => {
  const details = buildStyleDoc(BARE).sections[0];
  assert.equal(details.rows.length, 0);
  const filled = buildStyleDoc(FULL).sections[0];
  assert.ok(filled.rows.some((r) => r.label === "Style no." && r.value === "SS-1042"));
  // Not evergreen means the line is absent, not "No" — a document should not
  // assert things that were never decided.
  const notEver = buildStyleDoc({ style: { ...STYLE, evergreen: false }, generatedOn: "2026-08-04" });
  assert.equal(notEver.sections[0].rows.some((r) => r.label === "Evergreen"), false);
});

test("the created date is a calendar day, not a timestamp", () => {
  const details = buildStyleDoc(FULL).sections[0];
  assert.equal(details.rows.find((r) => r.label === "Created")?.value, "2026-03-02");
});

test("the running fit story is carried whole, line breaks and all", () => {
  const fit = buildStyleDoc(FULL).sections[1];
  assert.equal(fit.body, STYLE.fit_notes);
  assert.ok(renderDocText(buildStyleDoc(FULL)).includes("Still needs 1cm off the front rise."));
});

test("a trashed reference is still in the record, and says so", () => {
  assert.equal(referenceLabel({ designer: "Margiela", year: "1998", garment: "Tank" }), "Margiela — 1998 · Tank");
  assert.equal(referenceLabel({ designer: "Margiela", deleted_at: "2026-07-01" }), "Margiela (in Trash)");
  assert.equal(referenceLabel({ year: "Unknown" }), "Untitled reference");
});

test("sample rounds keep the order they were handed over in", () => {
  const cycle = buildStyleDoc(FULL).sections[3];
  assert.deepEqual(cycle.entries.map((e) => e.heading), ["proto1", "proto2"]);
});

test("a round prints both legs of the wait and what was said about it", () => {
  const [proto1] = buildStyleDoc(FULL).sections[3].entries;
  assert.equal(proto1.sub, "Sunrise Mills · received");
  const labels = proto1.rows.map((r) => r.label);
  assert.deepEqual(labels, [
    "Material supplier",
    "Material ordered",
    "Submitted to factory",
    "Received back",
  ]);
  assert.deepEqual(proto1.notes, [
    { label: "Fit", text: "Armhole tight." },
    { label: "Comments", text: "Asked for 1cm at the side seam." },
  ]);
});

test("an unshot photography slot is spelled out rather than left blank", () => {
  const photography = buildStyleDoc(FULL).sections[4];
  assert.deepEqual(photography.rows, [
    { label: "Model — front", value: "Shot" },
    { label: "Model — back", value: "Not shot yet" },
  ]);
});

test("versions and comments read oldest-first — a history is read forward", () => {
  const doc = buildStyleDoc(FULL);
  assert.deepEqual(doc.sections[5].entries.map((e) => e.heading), ["v1", "v2"]);
  assert.deepEqual(doc.sections[6].entries.map((e) => e.heading), ["gabby@", "kara@"]);
});

test("versions written in the same breath still read v1 then v2", () => {
  // Found live: a seed wrote both versions in one transaction, so they shared a
  // `created_at` to the microsecond and the timestamp sort left them in
  // whatever order the database returned — v2 above v1, a history read
  // backwards. A version number is the order; it settles the tie.
  const same = "2026-08-04T12:00:00Z";
  const doc = buildStyleDoc({
    style: { name: "x" },
    versions: [
      { version_no: 3, changes: "c", created_at: same },
      { version_no: 1, changes: "a", created_at: same },
      { version_no: 2, changes: "b", created_at: same },
    ],
    generatedOn: "2026-08-04",
  });
  assert.deepEqual(doc.sections[5].entries.map((e) => e.heading), ["v1", "v2", "v3"]);
});

test("a real date still outranks the version number", () => {
  // The tiebreak is a tiebreak, not a reordering: if the clock actually
  // distinguishes two versions, the clock is the history.
  const doc = buildStyleDoc({
    style: { name: "x" },
    versions: [
      { version_no: 2, created_at: "2026-01-01T00:00:00Z" },
      { version_no: 1, created_at: "2026-06-01T00:00:00Z" },
    ],
    generatedOn: "2026-08-04",
  });
  assert.deepEqual(doc.sections[5].entries.map((e) => e.heading), ["v2", "v1"]);
});

test("comments sharing a timestamp keep the order they were handed over in", () => {
  // No number decides a comment, so the caller's order is the answer — the
  // export page asks the database for them oldest-first for exactly this.
  const same = "2026-08-04T12:00:00Z";
  const doc = buildStyleDoc({
    style: { name: "x" },
    comments: [
      { body: "first", author: "gabby@", created_at: same },
      { body: "second", author: "kara@", created_at: same },
    ],
    generatedOn: "2026-08-04",
  });
  assert.deepEqual(doc.sections[6].entries.map((e) => e.heading), ["gabby@", "kara@"]);
});

test("a comment with no author is attributed to nobody rather than dropped", () => {
  const doc = buildStyleDoc({
    style: { name: "x" },
    comments: [{ body: "anon note" }],
    generatedOn: "2026-08-04",
  });
  assert.equal(doc.sections[6].entries[0].heading, "Unattributed");
  assert.equal(doc.sections[6].entries[0].notes[0].text, "anon note");
});

test("the footer counts what is in the document and names the day it was made", () => {
  assert.equal(
    buildStyleDoc(FULL).footer,
    "2 sample rounds · 2 versions · 2 comments. Exported from SSYNC on 2026-08-04."
  );
  assert.ok(
    buildStyleDoc({ style: { name: "x" }, samples: [{ round: "proto1" }], versions: [{ version_no: 1 }], comments: [{ body: "b" }], generatedOn: "2026-08-04" })
      .footer.startsWith("1 sample round · 1 version · 1 comment.")
  );
});

test("nothing in the document is invented from the clock", () => {
  const a = renderDocText(buildStyleDoc(FULL));
  const b = renderDocText(buildStyleDoc(FULL));
  assert.equal(a, b);
  assert.ok(a.includes("2026-08-04"));
});

test("the text rendering carries every heading and every round", () => {
  const text = renderDocText(buildStyleDoc(FULL));
  for (const heading of ["DETAILS", "FIT", "DEVELOPED FROM", "SAMPLE CYCLE", "PHOTOGRAPHY", "VERSIONS", "COMMENTS & FEEDBACK"]) {
    assert.ok(text.includes(heading), `${heading} missing`);
  }
  assert.ok(text.includes("proto1 — Sunrise Mills · received"));
  assert.ok(text.includes("Margiela — 1998 · Tank"));
});

test("the filename is something findable six months later", () => {
  const doc = buildStyleDoc(FULL);
  assert.equal(exportFilename(doc, "2026-08-04"), "cropped-rib-tank-2026-08-04.txt");
  assert.equal(exportFilename({ ...doc, title: "!!!" }, "2026-08-04"), "style-2026-08-04.txt");
});
