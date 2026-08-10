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
  fabric: "Butter rib",
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
    "Reference(s)",
    "Sample rounds",
    "Sample images",
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
  // Fabric is a detail of the style, not of a sample round (Tess, 2026-08-05).
  // An exported document that omits it is missing the first thing a factory
  // asks about.
  assert.ok(filled.rows.some((r) => r.label === "Fabric" && r.value === "Butter rib"));
  assert.equal(buildStyleDoc(BARE).sections[0].rows.some((r) => r.label === "Fabric"), false);
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

test("sample rounds read newest-first — the latest round leads", () => {
  // Handed over in cycle order (proto1, proto2); the history flips it so the
  // most recent round is at the top (Tess, 2026-08-10).
  const cycle = buildStyleDoc(FULL).sections[3];
  assert.deepEqual(cycle.entries.map((e) => e.heading), ["proto2", "proto1"]);
});

test("a round prints both legs of the wait and what was said about it", () => {
  const proto1 = buildStyleDoc(FULL).sections[3].entries.find((e) => e.heading === "proto1")!;
  assert.equal(proto1.sub, "Sunrise Mills · received");
  const labels = proto1.rows.map((r) => r.label);
  // Rating and location are absent on this round, so those rows are left out
  // rather than printed blank.
  assert.deepEqual(labels, [
    "Material supplier",
    "Material ordered",
    "Sample requested",
    "Received back",
  ]);
  assert.deepEqual(proto1.notes, [
    { label: "Fit", text: "Armhole tight." },
    { label: "Notes", text: "Asked for 1cm at the side seam." },
  ]);
});

test("a round carries its rating, location, shots and its own notes", () => {
  const doc = buildStyleDoc({
    style: { name: "x" },
    samples: [
      {
        round: "proto1",
        rating: "Workable",
        location: "With designer",
        material_notes: "Interlining swapped.",
        fit_notes: "Sleeve pitch off.",
        comments: "Sent corrections.",
        photos: [
          { label: "Front", url: "https://cdn/f.jpg" },
          { label: "", url: "https://cdn/b.jpg" },
        ],
      },
    ],
    generatedOn: "2026-08-04",
  });
  const e = doc.sections[3].entries[0];
  assert.equal(e.rows.find((r) => r.label === "Rating")?.value, "Workable");
  assert.equal(e.rows.find((r) => r.label === "Current location")?.value, "With designer");
  // Photos are their own list on the entry — the export page renders them as
  // thumbnails, not rows of URLs. Only the ones with a URL survive.
  assert.deepEqual(e.photos, [
    { label: "Front", url: "https://cdn/f.jpg" },
    { label: "", url: "https://cdn/b.jpg" },
  ]);
  assert.deepEqual(e.notes, [
    { label: "Fit", text: "Sleeve pitch off." },
    { label: "Material notes", text: "Interlining swapped." },
    { label: "Notes", text: "Sent corrections." },
  ]);
});

test("an unshot photography slot is spelled out rather than left blank", () => {
  const photography = buildStyleDoc(FULL).sections[4];
  assert.deepEqual(photography.rows, [
    { label: "Model — front", value: "Shot" },
    { label: "Model — back", value: "Not shot yet" },
  ]);
});

test("versions and comments read newest-first — latest news on top", () => {
  const doc = buildStyleDoc(FULL);
  assert.deepEqual(doc.sections[5].entries.map((e) => e.heading), ["v2", "v1"]);
  assert.deepEqual(doc.sections[6].entries.map((e) => e.heading), ["kara@", "gabby@"]);
});

test("versions written in the same breath still read v3, v2, v1", () => {
  // Found live: a seed wrote versions in one transaction, so they shared a
  // `created_at` to the microsecond and the timestamp sort left them in
  // whatever order the database returned. A version number is the order; it
  // settles the tie, and newest-first puts the highest number on top.
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
  assert.deepEqual(doc.sections[5].entries.map((e) => e.heading), ["v3", "v2", "v1"]);
});

test("a real date still outranks the version number", () => {
  // The tiebreak is a tiebreak, not a reordering: if the clock actually
  // distinguishes two versions, the clock is the history. v1 was saved in June,
  // v2 in January, so newest-first reads v1 above v2.
  const doc = buildStyleDoc({
    style: { name: "x" },
    versions: [
      { version_no: 2, created_at: "2026-01-01T00:00:00Z" },
      { version_no: 1, created_at: "2026-06-01T00:00:00Z" },
    ],
    generatedOn: "2026-08-04",
  });
  assert.deepEqual(doc.sections[5].entries.map((e) => e.heading), ["v1", "v2"]);
});

test("comments sharing a timestamp read newest-handed first", () => {
  // No number decides a comment, so the caller's order is the answer — the
  // export page asks the database for them oldest-first, and newest-first flips
  // that, so the last one typed in the same minute is on top.
  const same = "2026-08-04T12:00:00Z";
  const doc = buildStyleDoc({
    style: { name: "x" },
    comments: [
      { body: "first", author: "gabby@", created_at: same },
      { body: "second", author: "kara@", created_at: same },
    ],
    generatedOn: "2026-08-04",
  });
  assert.deepEqual(doc.sections[6].entries.map((e) => e.heading), ["kara@", "gabby@"]);
});

test("the WIP folder and general notes are in the record", () => {
  const doc = buildStyleDoc({
    style: { name: "x", tech_pack_url: "https://tp", wip_url: "https://wip", notes: "Runs with the SS26 block." },
    generatedOn: "2026-08-04",
  });
  const details = doc.sections[0];
  assert.equal(details.rows.find((r) => r.label === "Tech pack")?.value, "https://tp");
  assert.equal(details.rows.find((r) => r.label === "WIP")?.value, "https://wip");
  // General style notes ride under the details table, distinct from Fit.
  assert.equal(details.body, "Runs with the SS26 block.");
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
  for (const heading of ["DETAILS", "FIT", "REFERENCE(S)", "SAMPLE ROUNDS", "SAMPLE IMAGES", "VERSIONS", "COMMENTS & FEEDBACK"]) {
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
