// Tests for the WIP reader, written against the SOUS SOUS sheet.
//
// The fixture below is not invented shape — it is the real column vocabulary of
// SOUS SOUS WIP.xlsx, trimmed to the columns the source binds, and carrying the
// specific mess the real sheet carries: a Color value with two commas inside
// quotes, "NA" typed where there is nothing, a ship date written "5/26x", a
// received date written "RCVD 5/29", a courier tracking number sitting in a
// date column, a header row repeating where the next section starts, and a
// style number with a stray leading space.
//
// Those are the cases that decide whether this feature is safe. A naive comma
// split alone would move a colourway into Fabric and a fabric into Factory, and
// the row would still look plausible on screen.

import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_ROUNDS, STYLE_STATUSES } from "./types.ts";
import { SOUS_SOUS, WIP_SOURCES, wipSource, wipSourceForBrand, DEFAULT_WIP_SOURCE } from "./wipSources.ts";
import {
  splitCsv,
  splitMd,
  normalizeStyleNo,
  isHeaderRow,
  parseWipSheet,
  suggestFields,
  isBlankMark,
  sheetStatus,
  sheetDate,
  wipRounds,
  findEntry,
  wipChanges,
} from "./wipImport.ts";

const HEAD =
  "Notes,Product Image,Status,Delivery,Tech Pack Link,Style Name,Style Number,Color,Size,Contents,Factory,Proto 1 Ship Date,Proto 1 Tracking,Proto 1 Date RCVD,SMS Ship Date,SMS Date RCVD,PPS Ship Date,PPS Date RCVD,Bulk Ship Date";

const SHEET = [
  "SOUS SOUS WIP,,,,,,,,,,,,,,,,,,",
  "DROP 1,,,,,,,,,,,,,,,,,,",
  HEAD,
  'Waiting on lab dip,,Sampling,Drop 1,https://drive.example/tp/t02,Oversized Crewneck,TBC1026T02,"Black Onyx, Antique White, Bleached Mauve",XS-XL,100% Cotton,ASC LA,5/26x,Fedex 872249965948,RCVD 5/29,,,,,',
  ",,Development,Drop 1,,Sherpa Jacket,TBC1026J06,Bone,XS-XL,NA,NA,,,,,,,,",
  ",,Sampling,Drop 1,,Sherpa Jacket second line,TBC1026J06,,,,,,,,,,,,",
  ",,Dropped,Drop 1,,Ribbed Tank,TBC1026T01,Black,XS-XL,95% Cotton 5% Elastane,ASC LA,,,,,,,,",
  ",,APPROVED TO PPS,Drop 1,,Anorak Jacket,TBC1026J05,Olive,XS-XL,Nylon,ASC,4/2,,4/18,5/1,5/14,6/2,6/20,7/8",
  "DROP 2,,,,,,,,,,,,,,,,,,",
  HEAD,
  ",,Sampling,Drop 2,,Bike Short, TBC1026B23 ,Black,XS-XL,Nylon Spandex,ASC LA,,,,,,,,",
].join("\n");

const ENTRIES = parseWipSheet(SHEET, SOUS_SOUS);

// --- splitting ------------------------------------------------------------

test("splitCsv keeps a quoted value with commas in it whole", () => {
  assert.deepEqual(splitCsv('a,"one, two, three",b'), ["a", "one, two, three", "b"]);
});

test("splitCsv unescapes a doubled quote", () => {
  assert.deepEqual(splitCsv('a,"say ""hi""",b'), ["a", 'say "hi"', "b"]);
});

test("splitCsv trims and yields empty cells rather than dropping them", () => {
  assert.deepEqual(splitCsv(" a , ,b "), ["a", "", "b"]);
});

test("splitMd reads a markdown row and refuses a non-table line", () => {
  assert.deepEqual(splitMd("| a | b |"), ["a", "b"]);
  assert.equal(splitMd("not a table"), null);
});

test("both splitters drop the merged-cell marker in either spelling", () => {
  assert.deepEqual(splitCsv("[merged] x,y"), ["x", "y"]);
  assert.deepEqual(splitMd("| \\[merged\\] x | y |"), ["x", "y"]);
});

// --- keys -----------------------------------------------------------------

test("normalizeStyleNo survives stray spacing and case but never touches characters", () => {
  assert.equal(normalizeStyleNo(" tbc1026b23 "), "TBC1026B23");
  assert.equal(normalizeStyleNo("SS227 - T04"), "SS227-T04");
  assert.equal(normalizeStyleNo(null), "");
});

test("isHeaderRow recognises the source's key column and nothing else", () => {
  assert.equal(isHeaderRow(splitCsv(HEAD), SOUS_SOUS), true);
  assert.equal(isHeaderRow(["Notes", "Status", "Style Name"], SOUS_SOUS), false);
  // A data row holds a number, not the words.
  assert.equal(isHeaderRow(["TBC1026T02", "Oversized Crewneck"], SOUS_SOUS), false);
});

// --- parsing --------------------------------------------------------------

test("parseWipSheet ignores rows before any header and section titles", () => {
  assert.equal(ENTRIES.some((e) => /SOUS SOUS WIP|DROP/i.test(e.styleNo)), false);
});

test("parseWipSheet reads every style row once per block", () => {
  assert.deepEqual(
    ENTRIES.map((e) => e.key),
    ["TBC1026T02", "TBC1026J06", "TBC1026T01", "TBC1026J05", "TBC1026B23"]
  );
});

test("parseWipSheet counts blocks from the repeated header", () => {
  assert.equal(ENTRIES[0].block, 0);
  assert.equal(ENTRIES[ENTRIES.length - 1].block, 1);
});

test("parseWipSheet keeps the first line of a style and drops its continuation", () => {
  const j06 = ENTRIES.find((e) => e.key === "TBC1026J06")!;
  assert.equal(j06.values["Style Name"], "Sherpa Jacket");
});

test("parseWipSheet drops blank cells rather than storing empty strings", () => {
  const j06 = ENTRIES.find((e) => e.key === "TBC1026J06")!;
  assert.equal("Proto 1 Ship Date" in j06.values, false);
});

test("parseWipSheet returns nothing without a source", () => {
  assert.deepEqual(parseWipSheet(SHEET, null), []);
});

test("the quoted Color value lands in Color, not shifted into Contents", () => {
  const t02 = ENTRIES.find((e) => e.key === "TBC1026T02")!;
  assert.equal(t02.values["Color"], "Black Onyx, Antique White, Bleached Mauve");
  assert.equal(t02.values["Contents"], "100% Cotton");
  assert.equal(t02.values["Factory"], "ASC LA");
});

// --- suggestions ----------------------------------------------------------

test("suggestFields maps the sheet's columns onto SSYNC's fields and says where each came from", () => {
  const t02 = ENTRIES.find((e) => e.key === "TBC1026T02")!;
  const s = suggestFields(t02, SOUS_SOUS);
  const by = Object.fromEntries(s.map((x) => [x.field, x]));
  assert.equal(by.name.value, "Oversized Crewneck");
  assert.equal(by.fabric.value, "100% Cotton");
  assert.equal(by.fabric.from, "Contents");
  assert.equal(by.colors.value, "Black Onyx, Antique White, Bleached Mauve");
  assert.equal(by.factory.value, "ASC LA");
  assert.equal(by.notes.value, "Waiting on lab dip");
  assert.equal(by.tech_pack_url.value, "https://drive.example/tp/t02");
});

test("suggestFields never proposes a placeholder", () => {
  const j06 = ENTRIES.find((e) => e.key === "TBC1026J06")!;
  const fields = suggestFields(j06, SOUS_SOUS).map((s) => s.field);
  assert.equal(fields.includes("fabric"), false);
  assert.equal(fields.includes("factory"), false);
});

test("isBlankMark knows the ways people write nothing", () => {
  for (const v of ["NA", "n/a", "TBD", "tbc", "None", "-", "—", "X", " na "]) {
    assert.equal(isBlankMark(v), true, v);
  }
  for (const v of ["Nylon", "ASC LA", "0", "Natural"]) {
    assert.equal(isBlankMark(v), false, v);
  }
});

// --- status ---------------------------------------------------------------

test("sheetStatus maps the words this sheet actually uses", () => {
  const t02 = ENTRIES.find((e) => e.key === "TBC1026T02")!;
  assert.deepEqual(sheetStatus(t02, SOUS_SOUS), { raw: "Sampling", mapped: "development" });
  const t01 = ENTRIES.find((e) => e.key === "TBC1026T01")!;
  assert.deepEqual(sheetStatus(t01, SOUS_SOUS), { raw: "Dropped", mapped: "archived" });
});

test("an unmapped status is shown but not translated", () => {
  const j05 = ENTRIES.find((e) => e.key === "TBC1026J05")!;
  const s = sheetStatus(j05, SOUS_SOUS);
  assert.equal(s.raw, "APPROVED TO PPS");
  assert.equal(s.mapped, "");
});

test("every status this source maps to is a real SSYNC status", () => {
  for (const v of Object.values(SOUS_SOUS.statusMap)) {
    assert.ok((STYLE_STATUSES as readonly string[]).includes(v), v);
  }
});

// --- dates and rounds -----------------------------------------------------

test("sheetDate pulls the date out of what people typed", () => {
  assert.equal(sheetDate("5/26x"), "5/26");
  assert.equal(sheetDate("RCVD 5/29"), "5/29");
  assert.equal(sheetDate("5/26/26"), "5/26/26");
  assert.equal(sheetDate(""), "");
  assert.equal(sheetDate("approved"), "");
});

test("sheetDate refuses a date column holding a courier", () => {
  assert.equal(sheetDate("Fedex 872249965948"), "");
  assert.equal(sheetDate("Fedex 5/26"), "");
});

test("wipRounds returns only the rounds the sheet has dates for", () => {
  const t02 = ENTRIES.find((e) => e.key === "TBC1026T02")!;
  assert.deepEqual(wipRounds(t02, SOUS_SOUS), [
    { round: "proto1", label: "1st Proto", sent: "5/26", received: "5/29" },
  ]);
});

test("wipRounds reads a full cycle in order", () => {
  const j05 = ENTRIES.find((e) => e.key === "TBC1026J05")!;
  assert.deepEqual(
    wipRounds(j05, SOUS_SOUS).map((r) => [r.round, r.sent, r.received]),
    [
      ["proto1", "4/2", "4/18"],
      ["sms", "5/1", "5/14"],
      ["pps1", "6/2", "6/20"],
      ["bulk", "7/8", ""],
    ]
  );
});

test("every round this source names is a real sample round", () => {
  for (const r of SOUS_SOUS.rounds) {
    assert.ok((SAMPLE_ROUNDS as readonly string[]).includes(r.round), r.round);
  }
});

// --- matching -------------------------------------------------------------

test("findEntry matches on style number only, through spacing", () => {
  assert.equal(findEntry(ENTRIES, { id: "1", style_no: "tbc1026t02" })?.key, "TBC1026T02");
  assert.equal(findEntry(ENTRIES, { id: "1", style_no: " TBC1026B23" })?.key, "TBC1026B23");
  assert.equal(findEntry(ENTRIES, { id: "1", style_no: "" }), null);
  assert.equal(findEntry(ENTRIES, { id: "1", style_no: "NOPE1" }), null);
});

test("wipChanges marks fills apart from replacements and drops what already agrees", () => {
  const t02 = ENTRIES.find((e) => e.key === "TBC1026T02")!;
  const changes = wipChanges(
    { id: "1", style_no: "TBC1026T02", name: "Crewneck", fabric: "100% Cotton", factory: null },
    t02,
    SOUS_SOUS
  );
  const by = Object.fromEntries(changes.map((c) => [c.field, c]));
  // style_no and fabric already agree.
  assert.equal("style_no" in by, false);
  assert.equal("fabric" in by, false);
  assert.equal(by.name.kind, "replace");
  assert.equal(by.name.current, "Crewneck");
  assert.equal(by.factory.kind, "fill");
  assert.equal(by.factory.current, "");
});

test("wipChanges returns nothing when anything it needs is missing", () => {
  const t02 = ENTRIES.find((e) => e.key === "TBC1026T02")!;
  assert.deepEqual(wipChanges(null, t02, SOUS_SOUS), []);
  assert.deepEqual(wipChanges({ id: "1" }, null, SOUS_SOUS), []);
  assert.deepEqual(wipChanges({ id: "1" }, t02, null), []);
});

// --- the brand binding ----------------------------------------------------

test("there is exactly one source today, and it is Sous Sous", () => {
  assert.equal(WIP_SOURCES.length, 1);
  assert.equal(DEFAULT_WIP_SOURCE, "sous-sous");
  assert.equal(wipSource("sous-sous"), SOUS_SOUS);
  assert.equal(wipSource("nine-stories"), null);
  assert.equal(wipSource(""), null);
});

test("a style with no brand reads from Sous Sous", () => {
  assert.equal(wipSourceForBrand(null), SOUS_SOUS);
  assert.equal(wipSourceForBrand("  "), SOUS_SOUS);
  assert.equal(wipSourceForBrand("Sous Sous"), SOUS_SOUS);
  assert.equal(wipSourceForBrand("sous-sous"), SOUS_SOUS);
});

test("a style belonging to another brand reads from nothing at all", () => {
  // This is the whole safety property: a Nine Stories style sitting in the same
  // database must not be filled from the Sous Sous sheet just because that is
  // the only sheet bound so far.
  assert.equal(wipSourceForBrand("Nine Stories"), null);
  assert.equal(wipSourceForBrand("Enchanté"), null);
});
