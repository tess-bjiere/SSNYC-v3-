// Turning an .xlsx workbook into rows of plain strings.
//
// This is the second half of reading Kara's WIP directly. lib/zip.ts opens the
// archive; this reads the XML inside it and hands back a grid, which is the
// same shape lib/wipImport.ts already reads a pasted CSV into. Everything
// downstream — the column map, the brand binding, the propose-only rule — is
// unchanged and does not know where its rows came from.
//
// Three things in here are not obvious and all three are the difference between
// reading her sheet and misreading it:
//
//  - Text lives in a separate shared-strings table, not in the cells. A cell
//    marked t="s" holds an index. Read the cell literally and every style name
//    in the sheet comes back as a number.
//
//  - Dates are numbers. "5/26" typed into a date-formatted column is stored as
//    45803, and the only thing that says it is a date rather than a quantity is
//    the format attached to it, two files away in styles.xml. This reads that,
//    because a ship date coming back as 45803 is not a smaller problem than a
//    ship date coming back blank — it is a worse one, since it looks like data.
//
//  - The columns are sparse. A row writes only the cells that have something in
//    them, so position comes from each cell's own reference (B7), never from
//    counting. Counting would shift a factory into a colourway the first time
//    somebody left a cell empty.
//
// Dependency-free on purpose: unit-tested directly by node's test runner.

/** "B7" → 1. Column letters are base-26 with no zero: A..Z, AA, AB. */
export function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** "B7" → 7. */
export function rowIndex(ref: string): number {
  const m = ref.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * A date serial into the M/D/YYYY the rest of the reader already understands.
 *
 * The epoch is 1899-12-30 rather than 1900-01-01 because Excel believes 1900
 * was a leap year and counts a 29th of February that never happened. Shifting
 * the epoch back two days cancels it out for every date after 1900-03-01, which
 * is every date any WIP sheet will ever hold. Dates in January and February
 * 1900 would be a day out; nothing in fashion production is from 1900.
 *
 * The time of day is dropped. A ship date is a day.
 */
export function serialToDate(serial: number): string {
  if (!Number.isFinite(serial) || serial <= 0) return "";
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

/** The workbook's shared string table, in index order. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    const body = m[1] ?? "";
    // A string split across formatting runs is several <t> elements and one
    // value — "SOUS SOUS" with the second word bolded is still one style name.
    let text = "";
    for (const t of body.matchAll(/<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g)) text += t[1] ?? "";
    out.push(decodeXml(text));
  }
  return out;
}

// The format ids Excel reserves for dates and times. Anything else numbered
// under 164 is a quantity, a percentage or a currency.
const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Is this format code a date? Quoted literals and [colour] tags are not code. */
export function isDateFormat(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[yd]/i.test(bare);
}

/**
 * Which cell styles mean "this number is a date".
 *
 * A cell's s="4" indexes cellXfs, whose entry names a numFmtId, which is either
 * one of Excel's builtins or defined in numFmts above it. cellStyleXfs is a
 * different list with the same element name and must not be read here — doing
 * so silently shifts every index.
 */
export function parseDateStyles(stylesXml: string): Set<number> {
  const fmts = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/>/g)) {
    fmts.set(Number(m[1]), decodeXml(m[2]));
  }
  const section = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  const out = new Set<number>();
  if (!section) return out;
  let i = 0;
  for (const xf of section[1].matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const id = xf[1].match(/\bnumFmtId="(\d+)"/);
    const n = id ? Number(id[1]) : 0;
    const code = fmts.get(n);
    if (BUILTIN_DATE_FMTS.has(n) || (code !== undefined && isDateFormat(code))) out.add(i);
    i++;
  }
  return out;
}

/** Every worksheet in the workbook, in tab order, with the part that holds it. */
export function sheetParts(workbookXml: string, relsXml: string): { name: string; path: string }[] {
  const targets = new Map<string, string>();
  for (const r of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = r[1].match(/\bId="([^"]+)"/);
    const target = r[1].match(/\bTarget="([^"]+)"/);
    if (!id || !target) continue;
    const t = decodeXml(target[1]);
    targets.set(id[1], t.startsWith("/") ? t.slice(1) : `xl/${t}`);
  }
  const out: { name: string; path: string }[] = [];
  for (const s of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = s[1].match(/\bname="([^"]*)"/);
    const rid = s[1].match(/\br:id="([^"]+)"/);
    const path = rid ? targets.get(rid[1]) : undefined;
    if (path) out.push({ name: name ? decodeXml(name[1]) : "", path });
  }
  return out;
}

/**
 * One worksheet into a rectangular grid of strings.
 *
 * Blank cells come back as "" rather than being skipped, so column position is
 * preserved across a row that only filled three of nineteen columns. That is
 * the whole reason a grid is built at all instead of a list of values.
 */
export function parseSheet(xml: string, shared: readonly string[], dateStyles: ReadonlySet<number>): string[][] {
  const cells: { r: number; c: number; v: string }[] = [];
  let maxRow = 0;
  let maxCol = 0;

  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const ref = attrs.match(/\br="([A-Z]+\d+)"/);
    if (!ref) continue;
    const r = rowIndex(ref[1]);
    const c = colIndex(ref[1]);
    const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "n";
    const style = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);

    let v = "";
    if (type === "inlineStr") {
      for (const t of body.matchAll(/<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g)) v += t[1] ?? "";
      v = decodeXml(v);
    } else {
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const text = decodeXml(raw);
      if (type === "s") v = shared[Number(text)] ?? "";
      else if (type === "b") v = text === "1" ? "TRUE" : "FALSE";
      // A cell holding #REF! or #N/A is a broken formula, not a fact.
      else if (type === "e") v = "";
      else if (type === "str") v = text;
      else if (text === "") v = "";
      else if (dateStyles.has(style)) v = serialToDate(Number(text));
      else v = text;
    }

    v = v.replace(/\s+/g, " ").trim();
    if (!v) continue;
    cells.push({ r, c, v });
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }

  const grid: string[][] = [];
  for (let i = 0; i < maxRow; i++) grid.push(new Array<string>(maxCol + 1).fill(""));
  for (const cell of cells) {
    if (cell.r >= 1) grid[cell.r - 1][cell.c] = cell.v;
  }
  return grid;
}

export type Workbook = { sheets: { name: string; rows: string[][] }[] };

/**
 * A whole workbook, from the archive's already-extracted parts.
 *
 * Takes the entry map rather than the bytes so that the zip and the XML stay
 * separately testable, and so the one thing that needs node's zlib stays at the
 * edge instead of in here.
 */
export function readWorkbook(entries: Map<string, Uint8Array>): Workbook {
  const text = (name: string): string => {
    const e = entries.get(name);
    return e ? new TextDecoder("utf-8").decode(e) : "";
  };
  const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
  const dateStyles = parseDateStyles(text("xl/styles.xml"));
  const parts = sheetParts(text("xl/workbook.xml"), text("xl/_rels/workbook.xml.rels"));
  // A workbook whose relationships did not parse still has its sheets on disk
  // under the conventional names; falling back to those is better than
  // returning nothing at all.
  const list = parts.length
    ? parts
    : [...entries.keys()]
        .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
        .sort()
        .map((path) => ({ name: path, path }));

  return {
    sheets: list.map((p) => ({ name: p.name, rows: parseSheet(text(p.path), shared, dateStyles) })),
  };
}
