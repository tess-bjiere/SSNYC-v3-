// A style's details as a CSV row.
//
// Tess, 2026-08-07: "have an option to export csv of the above info from a
// style profile", with a screenshot of a New Product form.
//
// So the column names here are that form's words, in that form's order, not
// SSYNC's. This file exists to be read by another piece of software, and the
// one thing that decides whether an import works is whether the header row says
// what the importer expects. "Product Name" rather than "Name", "Hs code"
// rather than "HS code" — the capitalisation is copied from the screenshot
// deliberately and should not be tidied up.
//
// Ten columns and no more (Tess, 2026-08-07: "Export CSV should just include
// the fields from the screenshot above"). Season, factory, status and the two
// links were here and have been taken out. Extra columns do import, but they
// also have to be scrolled past, unmapped or deleted every single time, and an
// export whose header does not match the form it is going into stops being a
// paste and starts being a task.
//
// Dependency-free on purpose: unit-tested directly by node's test runner.

export type CsvStyleLike = {
  name?: string | null;
  garment?: string | null;
  style_no?: string | null;
  colors?: string | null;
  blank_style?: string | null;
  fabric?: string | null;
  material?: string | null;
  hs_code?: string | null;
  country_of_origin?: string | null;
  weight_lbs?: number | string | null;
};

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/**
 * A weight as the form writes it: three decimal places, or empty.
 *
 * Empty rather than "0.000" when nothing has been recorded, because a weight of
 * zero is a claim and an unfilled field is not. A shipment costed off a column
 * of zeroes is worse than one costed off a column of blanks, since blanks get
 * questioned.
 */
export function weightText(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(3);
}

/**
 * One cell, quoted when it has to be.
 *
 * A field is quoted if it holds a comma, a quote mark or a line break, and an
 * inner quote is doubled. That is RFC 4180 and it is what every spreadsheet
 * reads. Notes are the field that makes this non-optional: they contain commas
 * every time, and an unquoted note silently shifts every column after it.
 *
 * A leading =, +, - or @ is prefixed with a single quote. A cell beginning with
 * one of those is executed as a formula by Excel and Sheets on open, which is
 * how a spreadsheet export becomes a way to run something on somebody's
 * machine. Fabric contents beginning with a minus is the innocent version and
 * it is common enough to matter on its own.
 */
export function csvCell(v: string): string {
  const s = text(v);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** The header, exactly as the receiving form names its fields. */
export const CSV_COLUMNS = [
  "Product Name",
  "Product type",
  "Style Number",
  "Product Color",
  "Blank Style",
  "Fabric type",
  "Material",
  "Hs code",
  "Country of Origin",
  "Product Weight (lbs)",
] as const;

/** One style, in CSV_COLUMNS order, unescaped. */
export function styleCsvValues(style: CsvStyleLike | null | undefined): string[] {
  const s = style ?? {};
  return [
    text(s.name),
    text(s.garment),
    text(s.style_no),
    text(s.colors),
    text(s.blank_style),
    // Fabric type is styles.fabric — one field, two names (Tess, 2026-08-07:
    // "fabric is a duplicate of fabric type -- keep fabric type").
    text(s.fabric),
    // Its own field again (Tess, 2026-08-07: "add material into the detials
    // and csv export"). Fabric type is jersey, Material is 100% cotton.
    text(s.material),
    text(s.hs_code),
    text(s.country_of_origin),
    weightText(s.weight_lbs),
  ];
}

/**
 * The file.
 *
 * CRLF line endings, because that is what RFC 4180 says and what Excel on
 * Windows wants; every other reader accepts them. Takes a list so that this can
 * become the export for a whole season later without the row logic moving.
 */
export function styleCsv(styles: readonly CsvStyleLike[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c)).join(",")];
  for (const s of styles) lines.push(styleCsvValues(s).map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/**
 * A filename for one style: its number if it has one, else its name.
 *
 * The style number is preferred because it is the thing the receiving system
 * keys on, and because two styles called "Cropped Tee" in a downloads folder is
 * a problem you only notice later.
 */
export function styleCsvFilename(style: CsvStyleLike | null | undefined): string {
  const base = text(style?.style_no) || text(style?.name) || "style";
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "style";
  return `${safe}.csv`;
}
