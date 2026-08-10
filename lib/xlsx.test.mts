// Tests for the .xlsx reader.
//
// The fixtures are the shapes Excel actually writes: text held in a shared
// string table, a date stored as the number 45803 with its dateness recorded in
// a different file, a row that skips the columns it left empty, and a string
// broken into formatting runs because somebody bolded half of it.
//
// The date test is the one that matters most. A ship date read as 45803 would
// arrive in the panel looking like data, and a person accepting it would put a
// five-digit number in a date field without either of us noticing.

import test from "node:test";
import assert from "node:assert/strict";
import {
  colIndex,
  rowIndex,
  decodeXml,
  serialToDate,
  parseSharedStrings,
  isDateFormat,
  parseDateStyles,
  sheetParts,
  parseSheet,
  readWorkbook,
} from "./xlsx.ts";

const SHARED = `<?xml version="1.0"?><sst count="5" uniqueCount="5">
<si><t>Style Number</t></si>
<si><t>Factory</t></si>
<si><t>Proto 1 Ship Date</t></si>
<si><t>TBC1026T02</t></si>
<si><r><t>ASC </t></r><r><rPr><b/></rPr><t>LA</t></r></si>
</sst>`;

const STYLES = `<styleSheet>
<numFmts count="1"><numFmt numFmtId="164" formatCode="m/d/yyyy"/></numFmts>
<cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="2"/></cellXfs>
</styleSheet>`;

const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2" s="1"><v>45803</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>TBC1026J06</t></is></c><c r="B3" t="s"><v>4</v></c><c r="C3" t="e"><v>#REF!</v></c></row>
</sheetData></worksheet>`;

const WORKBOOK = `<workbook><sheets>
<sheet name="Drop 1" sheetId="1" r:id="rId1"/>
<sheet name="Trims" sheetId="2" r:id="rId2"/>
</sheets></workbook>`;

const RELS = `<Relationships>
<Relationship Id="rId1" Type="http://x/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://x/worksheet" Target="/xl/worksheets/sheet2.xml"/>
</Relationships>`;

// --- references -----------------------------------------------------------

test("colIndex reads base-26 column letters with no zero", () => {
  assert.equal(colIndex("A1"), 0);
  assert.equal(colIndex("B7"), 1);
  assert.equal(colIndex("Z1"), 25);
  assert.equal(colIndex("AA1"), 26);
  assert.equal(colIndex("AB1"), 27);
  assert.equal(colIndex("BA1"), 52);
});

test("rowIndex reads the number off a reference", () => {
  assert.equal(rowIndex("A1"), 1);
  assert.equal(rowIndex("AB214"), 214);
});

test("decodeXml handles named and numeric entities and leaves other text alone", () => {
  assert.equal(decodeXml("Cotton &amp; Silk"), "Cotton & Silk");
  assert.equal(decodeXml("&lt;tag&gt; &quot;q&quot; &apos;a&apos;"), `<tag> "q" 'a'`);
  assert.equal(decodeXml("Enchant&#233;"), "Enchanté");
  assert.equal(decodeXml("Enchant&#xe9;"), "Enchanté");
  assert.equal(decodeXml("100% cotton"), "100% cotton");
});

// --- dates ----------------------------------------------------------------

test("serialToDate converts a real ship date", () => {
  assert.equal(serialToDate(45803), "5/26/2025");
  assert.equal(serialToDate(45806), "5/29/2025");
});

test("serialToDate drops the time of day and refuses nonsense", () => {
  assert.equal(serialToDate(45803.75), "5/26/2025");
  assert.equal(serialToDate(0), "");
  assert.equal(serialToDate(Number.NaN), "");
});

test("isDateFormat ignores quoted literals and colour tags", () => {
  assert.equal(isDateFormat("m/d/yyyy"), true);
  assert.equal(isDateFormat("dd-mmm-yy"), true);
  assert.equal(isDateFormat('#,##0.00_);[Red]\\(#,##0.00\\)'), false);
  assert.equal(isDateFormat('0.00" days"'), false);
  assert.equal(isDateFormat("0%"), false);
});

test("parseDateStyles reads cellXfs and not cellStyleXfs", () => {
  const s = parseDateStyles(STYLES);
  assert.equal(s.has(0), false); // general
  assert.equal(s.has(1), true); // the custom m/d/yyyy
  assert.equal(s.has(2), false); // two decimal places
});

test("parseDateStyles knows the builtin date formats", () => {
  const s = parseDateStyles(`<styleSheet><cellXfs count="2"><xf numFmtId="14"/><xf numFmtId="9"/></cellXfs></styleSheet>`);
  assert.equal(s.has(0), true);
  assert.equal(s.has(1), false);
});

// --- strings --------------------------------------------------------------

test("parseSharedStrings joins the runs of one string back together", () => {
  const s = parseSharedStrings(SHARED);
  assert.equal(s.length, 5);
  assert.equal(s[0], "Style Number");
  assert.equal(s[4], "ASC LA");
});

test("parseSharedStrings survives an empty entry", () => {
  assert.deepEqual(parseSharedStrings(`<sst><si><t></t></si><si/><si><t>x</t></si></sst>`), ["", "", "x"]);
});

// --- worksheets -----------------------------------------------------------

test("sheetParts resolves tabs to their parts through the relationships", () => {
  assert.deepEqual(sheetParts(WORKBOOK, RELS), [
    { name: "Drop 1", path: "xl/worksheets/sheet1.xml" },
    { name: "Trims", path: "xl/worksheets/sheet2.xml" },
  ]);
});

test("parseSheet builds a grid, not a list of values", () => {
  const rows = parseSheet(SHEET, parseSharedStrings(SHARED), parseDateStyles(STYLES));
  assert.deepEqual(rows[0], ["Style Number", "Factory", "Proto 1 Ship Date"]);
});

test("a skipped cell holds its place so later columns do not shift left", () => {
  const rows = parseSheet(SHEET, parseSharedStrings(SHARED), parseDateStyles(STYLES));
  // Row 2 wrote A and C and left B empty. The date must stay under its header.
  assert.deepEqual(rows[1], ["TBC1026T02", "", "5/26/2025"]);
});

test("a date-formatted number becomes a date and a plain number does not", () => {
  const plain = parseSheet(
    `<sheetData><row r="1"><c r="A1"><v>45803</v></c></row></sheetData>`,
    [],
    parseDateStyles(STYLES)
  );
  assert.deepEqual(plain[0], ["45803"]);
});

test("inline strings are read and broken formulas are not", () => {
  const rows = parseSheet(SHEET, parseSharedStrings(SHARED), parseDateStyles(STYLES));
  assert.deepEqual(rows[2], ["TBC1026J06", "ASC LA", ""]);
});

test("booleans come back as words rather than as 1 and 0", () => {
  const rows = parseSheet(`<row r="1"><c r="A1" t="b"><v>1</v></c><c r="B1" t="b"><v>0</v></c></row>`, [], new Set());
  assert.deepEqual(rows[0], ["TRUE", "FALSE"]);
});

// --- the workbook ---------------------------------------------------------

function book(parts: Record<string, string>): Map<string, Uint8Array> {
  const enc = new TextEncoder();
  return new Map(Object.entries(parts).map(([k, v]) => [k, enc.encode(v)]));
}

test("readWorkbook returns each tab in order with its rows", () => {
  const wb = readWorkbook(
    book({
      "xl/sharedStrings.xml": SHARED,
      "xl/styles.xml": STYLES,
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/sheet1.xml": SHEET,
      "xl/worksheets/sheet2.xml": `<row r="1"><c r="A1" t="inlineStr"><is><t>Trim library</t></is></c></row>`,
    })
  );
  assert.deepEqual(wb.sheets.map((s) => s.name), ["Drop 1", "Trims"]);
  assert.deepEqual(wb.sheets[0].rows[1], ["TBC1026T02", "", "5/26/2025"]);
  assert.deepEqual(wb.sheets[1].rows[0], ["Trim library"]);
});

test("readWorkbook falls back to the conventional sheet names when relationships are missing", () => {
  const wb = readWorkbook(
    book({ "xl/worksheets/sheet1.xml": `<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>` })
  );
  assert.equal(wb.sheets.length, 1);
  assert.deepEqual(wb.sheets[0].rows[0], ["x"]);
});
