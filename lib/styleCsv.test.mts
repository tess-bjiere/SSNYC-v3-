// Tests for the style CSV.
//
// Two of these are the ones worth having. Quoting, because a note with a comma
// in it shifts every column after it and the damage shows up in somebody else's
// system a week later; and the formula guard, because a cell starting with an
// equals sign is executed on open by both Excel and Sheets.

import test from "node:test";
import assert from "node:assert/strict";
import {
  CSV_COLUMNS,
  csvCell,
  styleCsv,
  styleCsvFilename,
  styleCsvValues,
  weightText,
  type CsvStyleLike,
} from "./styleCsv.ts";

const FULL: CsvStyleLike = {
  name: "Cropped Tee",
  garment: "Athletic Shorts",
  style_no: "TBC1026T02",
  colors: "Vintage Heather",
  blank_style: "IND4000 + F102 - Black",
  fabric: "Jersey",
  material: "100% cotton",
  hs_code: "6109.10.00",
  country_of_origin: "Portugal",
  weight_lbs: 0.42,
};

test("the header is the receiving form's words, in its order", () => {
  assert.equal(CSV_COLUMNS[0], "Product Name");
  assert.equal(CSV_COLUMNS[2], "Style Number");
  // Copied from the screenshot, lower-case s and all. Tidying it up would be
  // the change that breaks the import.
  assert.equal(CSV_COLUMNS[7], "Hs code");
  assert.equal(CSV_COLUMNS[9], "Product Weight (lbs)");
});

test("the file is only the form's fields — nothing of SSYNC's own", () => {
  // Tess, 2026-08-07: "Export CSV should just include the fields from the
  // screenshot above". A column the receiving form has no home for is one more
  // thing to unmap or delete on every single import.
  assert.equal(CSV_COLUMNS.length, 10);
  for (const gone of ["Season", "Factory", "Status", "Notes", "Tech Pack", "WIP"]) {
    assert.equal((CSV_COLUMNS as readonly string[]).includes(gone), false, `${gone} is still exported`);
  }
});

test("every column has a value and the row is the same length as the header", () => {
  assert.equal(styleCsvValues(FULL).length, CSV_COLUMNS.length);
  assert.equal(styleCsvValues(null).length, CSV_COLUMNS.length);
});

test("the FRED variant drops Blank Style — header and value together", () => {
  // Tess, 2026-08-20: "remove those from style form and csv". FRED does not use
  // Blank Style, so its export is nine columns; the default is untouched.
  const opts = { includeBlankStyle: false };
  const header = styleCsv([], opts).trim();
  assert.equal(header.split(",").includes("Blank Style"), false);
  assert.equal(header.split(",").length, 9);
  // The value row stays aligned to the shortened header.
  const v = styleCsvValues(FULL, opts);
  assert.equal(v.length, 9);
  assert.equal(v.includes("IND4000 + F102 - Black"), false);
  // Default (no option) is unchanged — all ten, Blank Style present.
  assert.equal(styleCsvValues(FULL).length, 10);
  assert.equal(styleCsvValues(FULL).includes("IND4000 + F102 - Black"), true);
});

test("Fabric type and Material are separate facts and both travel", () => {
  // Fabric type is what it is made IN, Material is what it is made OF. A
  // factory quoting a price and a customs entry need different ones.
  const v = styleCsvValues(FULL);
  assert.equal(v[CSV_COLUMNS.indexOf("Fabric type")], "Jersey");
  assert.equal(v[CSV_COLUMNS.indexOf("Material")], "100% cotton");
});

test("Product type is the garment and Product Color is the colourway", () => {
  const v = styleCsvValues(FULL);
  assert.equal(v[CSV_COLUMNS.indexOf("Product type")], "Athletic Shorts");
  assert.equal(v[CSV_COLUMNS.indexOf("Product Color")], "Vintage Heather");
});

// --- weights ---------------------------------------------------------------

test("a weight is written to three places, as the form shows it", () => {
  assert.equal(weightText(0.42), "0.420");
  assert.equal(weightText("1.5"), "1.500");
  assert.equal(weightText(0), "0.000");
});

test("an unrecorded weight is blank rather than zero", () => {
  // Zero is a claim; blank is an absence, and a blank gets questioned before a
  // shipment is costed off it.
  assert.equal(weightText(null), "");
  assert.equal(weightText(undefined), "");
  assert.equal(weightText(""), "");
  assert.equal(weightText("heavy"), "");
});

// --- escaping --------------------------------------------------------------

test("a cell with a comma is quoted", () => {
  assert.equal(csvCell("Shorten by 1cm, then re-cut"), '"Shorten by 1cm, then re-cut"');
});

test("a cell with a quote mark doubles it inside quotes", () => {
  assert.equal(csvCell('the "good" one'), '"the ""good"" one"');
});

test("a cell with a line break is quoted so it stays one field", () => {
  assert.equal(csvCell("one\ntwo"), '"one\ntwo"');
});

test("a plain cell is not quoted", () => {
  assert.equal(csvCell("100% cotton"), "100% cotton");
  assert.equal(csvCell(""), "");
});

test("a cell that a spreadsheet would run as a formula is defused", () => {
  // Excel and Sheets both execute a leading =, +, - or @ on open.
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-cotton"), "'-cotton");
  // And the guard survives the quoting, rather than one undoing the other.
  assert.equal(csvCell("=a,b"), `"'=a,b"`);
});

// --- the file --------------------------------------------------------------

test("the file is a header and one row per style, CRLF terminated", () => {
  const out = styleCsv([FULL]);
  const lines = out.split("\r\n");
  assert.equal(lines[0], CSV_COLUMNS.join(","));
  assert.match(lines[1], /^Cropped Tee,Athletic Shorts,TBC1026T02,/);
  assert.match(lines[1], /,Jersey,100% cotton,6109\.10\.00,/);
  assert.equal(lines[2], "");
});

test("the file holds a header alone when there is nothing to export", () => {
  assert.equal(styleCsv([]), CSV_COLUMNS.join(",") + "\r\n");
});

test("more than one style is more than one row", () => {
  const out = styleCsv([FULL, { name: "Other", style_no: "X1" }]);
  assert.equal(out.trim().split("\r\n").length, 3);
});

// --- the filename ----------------------------------------------------------

test("the filename prefers the style number", () => {
  assert.equal(styleCsvFilename(FULL), "TBC1026T02.csv");
});

test("the filename falls back to the name, made safe", () => {
  assert.equal(styleCsvFilename({ name: "Cropped Tee / v2" }), "Cropped-Tee-v2.csv");
});

test("a style with neither still gets a file", () => {
  assert.equal(styleCsvFilename({}), "style.csv");
  assert.equal(styleCsvFilename(null), "style.csv");
});
