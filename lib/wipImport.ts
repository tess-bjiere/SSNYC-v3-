// Reading a brand's WIP sheet and PROPOSING style details from it.
//
// Tess, 2026-08-06: "is it possible to auto populate style details based on the
// info in google sheet WIP / techpacks?" — then: "currently the tool should
// only pull from the SOUS SOUS WIP. later we will have brand profiles, each
// brand will only ever pull from their own brand wip".
//
// Which sheet is legal to read is decided in lib/wipSources.ts. This file never
// chooses a sheet, never searches for one, and cannot be called without being
// handed one. That is deliberate: the failure this feature could produce is one
// brand's fabric quietly landing on another brand's style, and the only durable
// defence is that the reader has no way to reach a sheet nobody named.
//
// The second rule, equally load-bearing: this file only ever PROPOSES. There is
// no writer in it and it is not allowed to grow one. A WIP sheet is a working
// document — half-typed cells, "5/26x", "RCVD 5/29", a tracking number in a
// date column. Anything that wrote it into styles unattended would be
// overwriting a checked fact with an unchecked one, silently, at scale. A
// person sees what the sheet says beside what the style says, and picks.
//
// Dependency-free on purpose: unit-tested directly by node's test runner.

import type { WipSource, WipField, WipRoundColumn } from "./wipSources.ts";

export type { WipField } from "./wipSources.ts";

export type WipRow = Record<string, string>;

/** One style's row (or rows) in the sheet, read against a source's columns. */
export type WipEntry = {
  /** The style number as typed in the sheet. */
  styleNo: string;
  /** The comparison key — see normalizeStyleNo. */
  key: string;
  /** header → value, trimmed, blanks dropped. */
  values: WipRow;
  /** Which repeat of the header this came under — sheets stack tables. */
  block: number;
};

// The markdown export marks a merged cell; a CSV export does not. Neither form
// is content.
const MERGED = /\\?\[merged\\?\]/g;

/** Markdown escapes `#` and friends; these sheets never contain a backslash. */
function unescape(v: string): string {
  return v.replace(/\\(.)/g, "$1");
}

function clean(v: string | null | undefined): string {
  return typeof v === "string" ? unescape(v.replace(MERGED, "")).replace(/\s+/g, " ").trim() : "";
}

/**
 * One CSV line into cells, respecting quotes.
 *
 * Quoting is not a formality in this sheet: the Color column routinely holds
 * "Black Onyx, Antique White, Bleached Mauve" — a single value with two commas
 * in it. Splitting on commas naively shifts every column to its right, which
 * would put a colourway in the Fabric field and a fabric in the Factory field.
 */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((c) => c.replace(MERGED, "").trim());
}

/** One markdown table line into cells. Returns null for non-table lines. */
export function splitMd(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const cells = t.split("|");
  cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.replace(MERGED, "").trim());
}

/** The `| :-: | :-: |` line an export puts under a header carries no data. */
function isRule(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => c === "" || /^:?-{1,}:?$/.test(c));
}

/**
 * Two spellings of a style number are the same style when they differ only in
 * spacing and case. Letters and digits are never touched.
 *
 * Sous Sous numbers are systematic — TBC1026T02 is brand, drop month, year,
 * category, sequence — so this mostly has to survive a stray space (" TBC1026B23"
 * appears in the sheet with a leading one). It still normalises hyphen spacing,
 * because the moment a second brand is added its numbers will not be this tidy.
 */
export function normalizeStyleNo(v: string | null | undefined): string {
  return clean(v)
    .toUpperCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "");
}

/**
 * A header row is one that names the source's key column. Every stacked table
 * in the sheet repeats it, and no data row can imitate it, because a data row
 * holds a style number rather than the words "Style Number".
 */
export function isHeaderRow(cells: string[], source: WipSource): boolean {
  return cells.some((c) => source.key_column.test(clean(c)));
}

/**
 * Read a sheet export against one named source.
 *
 * Header rows repeat down these sheets — a new section, sometimes with an extra
 * column inserted, sometimes a different table altogether — so the reader finds
 * every header and reads what follows against THAT header's columns. Rows
 * before any header, and rows under a header with no key column, yield nothing
 * rather than being read against a guess.
 *
 * A style number appearing under two headers stays two entries. Those are
 * different tables and may hold different facts about the same garment; merging
 * them here would invent a row nobody typed. The caller shows both and says
 * which block each came from.
 */
export function parseWipSheet(text: string, source: WipSource | null | undefined): WipEntry[] {
  if (!source) return [];
  const split = source.format === "md" ? splitMd : (l: string) => splitCsv(l);
  const rows: string[][] = [];
  for (const line of String(text ?? "").split("\n")) {
    const cells = split(line);
    if (cells) rows.push(cells);
  }
  return parseWipRows(rows, source);
}

/**
 * The same read, from a grid rather than from text.
 *
 * A pasted CSV and an .xlsx fetched from Drive arrive differently and mean the
 * same thing, so they meet here rather than each growing their own reader. This
 * is the function that actually knows how a WIP sheet is laid out; everything
 * above it is only deciding how to get the cells.
 */
export function parseWipRows(
  rows: readonly (readonly string[])[],
  source: WipSource | null | undefined
): WipEntry[] {
  if (!source) return [];
  const out: WipEntry[] = [];
  const seen = new Set<string>();
  let headers: string[] = [];
  let keyIdx = -1;
  let block = -1;

  for (const cells of rows ?? []) {
    if (!cells || cells.length === 0 || isRule(cells as string[])) continue;

    if (isHeaderRow(cells as string[], source)) {
      headers = cells.map((c) => clean(c));
      keyIdx = headers.findIndex((h) => source.key_column.test(h));
      block += 1;
      continue;
    }
    if (keyIdx < 0) continue;

    const styleNo = clean(cells[keyIdx] ?? "");
    const key = normalizeStyleNo(styleNo);
    if (!key) continue;

    const values: WipRow = {};
    headers.forEach((h, i) => {
      const v = clean(cells[i] ?? "");
      // A duplicated header (this sheet has two "Trim 2" columns) keeps the
      // first filled one rather than the last, which is the one a person
      // reading left to right sees against the style.
      if (h && v && !values[h]) values[h] = v;
    });

    // The same style listed twice under one header is one style — the second
    // line is a continuation, not a new garment.
    const dedupe = `${block}:${key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    out.push({ styleNo, key, values, block });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Turning sheet cells into things a person can accept.
// ---------------------------------------------------------------------------

export type WipSuggestion = {
  field: WipField;
  /** SSYNC's word for the field. */
  label: string;
  value: string;
  /** Which column it came from, so a wrong suggestion can be traced. */
  from: string;
};

export function suggestFields(
  entry: WipEntry | null | undefined,
  source: WipSource | null | undefined
): WipSuggestion[] {
  if (!entry || !source) return [];
  const out: WipSuggestion[] = [];
  for (const col of source.columns) {
    const header = Object.keys(entry.values).find((h) => col.test.test(h));
    const value = header ? entry.values[header] : "";
    // "NA" is how these sheets write "there is nothing here", and it is not a
    // fabric, a factory or a trim. It is dropped rather than proposed.
    if (!value || isBlankMark(value)) continue;
    out.push({ field: col.field, label: col.label, value, from: header! });
  }
  return out;
}

/** Placeholders people type meaning "nothing", which must never be written. */
export function isBlankMark(v: string): boolean {
  return /^(na|n\/a|tbd|tbc|none|-|—|x)$/i.test(v.trim());
}

/**
 * The status the sheet gives, and what SSYNC would make of it.
 *
 * `mapped` is empty when the sheet's word is not in the source's map. In that
 * case the word is still returned and shown — the sheet's own vocabulary is
 * information — but no status change is offered, because translating a word
 * nobody mapped is this file making a decision only a person can make.
 */
export function sheetStatus(
  entry: WipEntry | null | undefined,
  source: WipSource | null | undefined
): { raw: string; mapped: string } {
  if (!entry || !source) return { raw: "", mapped: "" };
  const h = Object.keys(entry.values).find((k) => /^status$/i.test(k));
  const raw = h ? entry.values[h] : "";
  const mapped = raw ? source.statusMap[raw.trim().toLowerCase()] ?? "" : "";
  return { raw, mapped };
}

export type WipRound = {
  round: string;
  label: string;
  /** style_samples.submitted_date — when it went. */
  sent: string;
  /** style_samples.received_date — when it came back. */
  received: string;
};

/**
 * Dates in these columns are typed by people mid-week: "5/26x", "RCVD 5/29",
 * "Fedex 872249965948" pasted into the wrong cell. This pulls the date out and
 * leaves everything it does not recognise behind.
 *
 * No year is written in the sheet, so none is invented here — the value comes
 * back as it was found, M/D. Turning that into a real date needs a year the
 * caller knows (the season, the drop) and that decision does not belong in a
 * parser.
 */
export function sheetDate(v: string | null | undefined): string {
  const t = clean(v);
  if (!t) return "";
  const m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return "";
  // A tracking number can contain digits and slashes in theory; a date column
  // holding a courier name is not a date, whatever else is in it.
  if (/fedex|ups|dhl|tracking/i.test(t)) return "";
  return m[3] ? `${m[1]}/${m[2]}/${m[3]}` : `${m[1]}/${m[2]}`;
}

/** The rounds this sheet has dates for, as rounds. */
export function wipRounds(
  entry: WipEntry | null | undefined,
  source: WipSource | null | undefined
): WipRound[] {
  if (!entry || !source) return [];
  const pick = (re: RegExp | undefined): string => {
    if (!re) return "";
    const h = Object.keys(entry.values).find((k) => re.test(k));
    return h ? sheetDate(entry.values[h]) : "";
  };
  const out: WipRound[] = [];
  for (const r of source.rounds as readonly WipRoundColumn[]) {
    const sent = pick(r.sent);
    const received = pick(r.received);
    if (sent || received) out.push({ round: r.round, label: r.label, sent, received });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matching the sheet to what is already here.
// ---------------------------------------------------------------------------

export type WipStyleLike = {
  id: string;
  style_no?: string | null;
  name?: string | null;
  fabric?: string | null;
  colors?: string | null;
  factory?: string | null;
  notes?: string | null;
  tech_pack_url?: string | null;
  brand?: string | null;
};

/** Find a style's row in a sheet, by style number. Nothing else is matched on. */
export function findEntry(
  entries: readonly WipEntry[],
  style: WipStyleLike | null | undefined
): WipEntry | null {
  const key = normalizeStyleNo(style?.style_no);
  if (!key) return null;
  return entries.find((e) => e.key === key) ?? null;
}

export type WipChange = WipSuggestion & {
  /** What the style says now — "" when the field is empty. */
  current: string;
  /** An empty field is a fill; a different value is a replacement. */
  kind: "fill" | "replace";
};

/**
 * What the sheet would change, if a person accepted all of it.
 *
 * Fields that already agree are dropped — a list of things that would do
 * nothing is a list nobody reads. Fills and replacements are marked apart,
 * because they are different decisions: filling a blank costs nothing, and
 * replacing something a person typed here is the one that needs looking at.
 */
export function wipChanges(
  style: WipStyleLike | null | undefined,
  entry: WipEntry | null | undefined,
  source: WipSource | null | undefined
): WipChange[] {
  if (!style || !entry || !source) return [];
  return suggestFields(entry, source)
    .map((s) => {
      const current = clean((style as Record<string, unknown>)[s.field] as string | null | undefined);
      return { ...s, current, kind: current ? ("replace" as const) : ("fill" as const) };
    })
    .filter((c) => c.current !== c.value);
}
