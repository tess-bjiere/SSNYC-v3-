// Which WIP sheet a style is allowed to be read from.
//
// Tess, 2026-08-06: "currently the tool should only pull from the SOUS SOUS
// WIP. later we will have brand profiles, each brand will only ever pull from
// their own brand wip".
//
// That sentence is a rule about safety before it is a rule about convenience.
// The Loyalist runs several brands out of one Drive, and their sheets share
// column names, style-number prefixes and even garment names — "Sports Bra" is
// in more than one of them. A reader pointed at "whatever WIP it can find"
// would eventually put one brand's fabric on another brand's style, and it
// would do it quietly, because nothing about the row would look wrong.
//
// So the source is not a search result. It is a named thing, declared here, and
// a style can only ever be filled from the source its brand is bound to. Today
// that list has one entry. When brand profiles land, a brand gets a row in this
// file and nothing else in the reader changes — which is the whole reason the
// binding is a list of sources rather than a constant.
//
// The columns live here too, not in the parser. Two brands' sheets are laid out
// differently — the Nine Stories sheet I first read has merged trim rows, a
// FABRIC column and its own status words; this one is a flat grid with a Status
// column that already speaks the same language SSYNC does. A parser that tried
// to know both would be guessing at which. A parser handed a column map for one
// named brand is only ever reading the sheet it was told to read.
//
// Dependency-free on purpose: unit-tested directly by node's test runner.

/** A field on a style this reader is allowed to propose a value for. */
export type WipField =
  | "style_no"
  | "name"
  | "fabric"
  | "colors"
  | "factory"
  | "notes"
  | "tech_pack_url";

export type WipColumn = {
  field: WipField;
  /** The word on the button — SSYNC's word, not the sheet's. */
  label: string;
  /** Header match. Loose because headers are typed by people, anchored so it
   *  cannot swallow a neighbour ("Fabric Cost" is not "Fabric"). */
  test: RegExp;
};

export type WipRoundColumn = {
  /** One of SAMPLE_ROUNDS in lib/types.ts. Pinned by test, not by import. */
  round: string;
  label: string;
  /** When it went to the factory → style_samples.submitted_date. */
  sent: RegExp;
  /** When it came back → style_samples.received_date. */
  received?: RegExp;
};

export type WipSource = {
  /** Stable id — what a brand profile will store. */
  key: string;
  /** Brand, as people say it. */
  brand: string;
  /** The Drive file. Named so a wrong sheet is obvious on sight. */
  fileId: string;
  fileName: string;
  /**
   * How the export is laid out. "csv" is a downloaded sheet; "md" is the
   * markdown-table shape the Drive reader hands back for a Google Sheet.
   */
  format: "csv" | "md";
  /** The column that identifies a style. Also how a header row is recognised. */
  key_column: RegExp;
  columns: WipColumn[];
  rounds: WipRoundColumn[];
  /**
   * The sheet's status words → SSYNC's three statuses.
   *
   * This map exists per-source and not globally on purpose. Sous Sous writes
   * Sampling / Development / Dropped, which is very nearly SSYNC's own
   * vocabulary, so mapping it is reading rather than guessing. The Nine Stories
   * sheet writes "APPROVED TO PPS" and mapping that would be inventing a
   * decision. A brand whose words do not map simply gets an empty map and its
   * status is shown as text instead of offered as a change.
   */
  statusMap: Record<string, string>;
};

/**
 * Sous Sous — the only source today.
 *
 * SOUS SOUS WIP.xlsx, owned by kara@theloyalist.com. An .xlsx living in Drive
 * rather than a Google Sheet, which matters: it is read as a downloaded grid,
 * not as a live sheet, so what this reader sees is a snapshot of the moment it
 * was pulled and the panel says so.
 *
 * Its shape, from reading it on 2026-08-06: one row per style — no merged trim
 * blocks, which is what made the Nine Stories sheet awkward — with the header
 * row repeating where a new section starts (Drop 1 tech packs, holding, then a
 * trim-library block at the bottom that is a different table altogether and is
 * skipped because it has no Style Number column of this name).
 *
 * Style numbers are already systematic: TBC-10-26-T-02 run together as
 * TBC1026T02 — brand, drop month, year, category letter, sequence. That is the
 * naming convention that has been the open question on this feature; it exists,
 * it is written down at the bottom of this very sheet, and it means matching a
 * sheet row to a style is exact rather than fuzzy.
 */
export const SOUS_SOUS: WipSource = {
  key: "sous-sous",
  brand: "Sous Sous",
  fileId: "1zklZLFIBhwigYtpBY_Ql5C1lKar_dxcG",
  fileName: "SOUS SOUS WIP.xlsx",
  format: "csv",
  key_column: /^style\s*number$/i,
  columns: [
    { field: "style_no", label: "Style number", test: /^style\s*number$/i },
    { field: "name", label: "Name", test: /^style\s*name$/i },
    // "Contents" is the garment's fibre content ("100% Cotton"); "Fabric
    // Contents" is the mill's version of the same fact and is usually blank.
    // Either fills Fabric; Fabric Cost, Fabric Mill and the rest are left in
    // the sheet, because SSYNC has nowhere honest to put them.
    { field: "fabric", label: "Fabric", test: /^(fabric\s*contents?|contents)$/i },
    { field: "colors", label: "Colors", test: /^colou?rs?$/i },
    { field: "factory", label: "Factory", test: /^factory$/i },
    { field: "notes", label: "Notes", test: /^notes$/i },
    { field: "tech_pack_url", label: "Tech pack", test: /^tech\s*pack\s*link$/i },
  ],
  // Ship and RCVD are real dates — when it actually went and actually came
  // back — so these map onto submitted_date and received_date rather than onto
  // eta_date. Tracking numbers and fit dates sit in columns of their own and
  // are deliberately not read: a tracking number belongs to the courier, and a
  // fit date is a meeting, not a leg of the sample cycle.
  rounds: [
    { round: "proto1", label: "1st Proto", sent: /^proto\s*1\s*ship\s*date$/i, received: /^proto\s*1\s*date\s*rcvd$/i },
    { round: "sms", label: "SMS", sent: /^sms\s*ship\s*date$/i, received: /^sms\s*date\s*rcvd$/i },
    { round: "pps1", label: "PPS", sent: /^pps\s*ship\s*date$/i, received: /^pps\s*date\s*rcvd$/i },
    { round: "bulk", label: "Bulk", sent: /^bulk\s*ship\s*date$/i },
  ],
  statusMap: {
    // Her sheet's words, lower-cased. "Sampling" is the word SSYNC now shows
    // for the development status, so this is one word meeting itself.
    sampling: "development",
    development: "development",
    developing: "development",
    // Dropped is finished business — the same thing Archived means here, and
    // the reason archived styles were split out of the factory view.
    dropped: "archived",
    production: "production",
    bulk: "production",
  },
};

/**
 * Every source the reader knows. One today, on purpose.
 *
 * Nine Stories and Enchanté have WIP sheets in the same Drive and are NOT here.
 * That is not an oversight — until a brand has a profile saying which sheet is
 * its own, adding a second source would mean a style could be filled from a
 * sheet belonging to another brand.
 */
export const WIP_SOURCES: readonly WipSource[] = [SOUS_SOUS];

/** The source used when nothing else says otherwise. */
export const DEFAULT_WIP_SOURCE = SOUS_SOUS.key;

export function wipSource(key: string | null | undefined): WipSource | null {
  const k = String(key ?? "").trim().toLowerCase();
  if (!k) return null;
  return WIP_SOURCES.find((s) => s.key === k) ?? null;
}

/**
 * The source a style may be read from.
 *
 * A style with no brand set resolves to Sous Sous, because Sous Sous is the
 * only source there is and a blank field is an absence rather than a claim to
 * be somebody else. A style whose brand IS set and is not a source — a Nine
 * Stories style, sitting in the same database — resolves to nothing and gets no
 * panel. That asymmetry is the point: the dangerous case is not "no brand", it
 * is "a brand that is demonstrably not this one", and falling through to the
 * one sheet we happen to have would be exactly the mistake this file exists to
 * prevent.
 *
 * The signature already takes the brand so that when brand profiles land this
 * becomes a lookup and no caller changes.
 */
export function wipSourceForBrand(brand: string | null | undefined): WipSource | null {
  const b = String(brand ?? "").trim().toLowerCase();
  if (!b) return SOUS_SOUS;
  const found = WIP_SOURCES.find((s) => s.brand.toLowerCase() === b || s.key === b);
  if (found) return found;
  // A brand nobody has bound to a sheet reads from nothing. The alternative —
  // defaulting to the one source we happen to have — is exactly the mistake
  // this file exists to prevent.
  return null;
}
