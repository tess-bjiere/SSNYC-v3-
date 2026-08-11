"use server";

// Reading a style's row out of its brand's WIP sheet, and writing one field of
// it if a person says so.
//
// Tess, 2026-08-06: "Pull from WIP".
//
// The whole design of this file is one rule: the sheet proposes, a person
// disposes. There is no bulk apply, no "accept all", and nothing runs in the
// background. Every write is one field, on one style, because somebody looked
// at the sheet's value next to the current one and pressed a button. That is
// deliberate and it should stay that way — a WIP sheet is a live document three
// people type into during a working day, and half of what is in it at any
// moment is a guess somebody is about to correct. A tool that silently
// overwrote SSYNC from it would be a tool that loses work on a Tuesday.
//
// Two ways in, one reader behind them. When the Google credentials are set the
// sheet is fetched from Drive; when they are not, the same panel takes pasted
// CSV. Both end in lib/wipImport.ts and produce the same rows, so the second is
// a genuine fallback rather than a lesser feature.
//
// Rounds are shown but not writable here. A sample round is a row with its own
// life — comments, photos, a received date somebody set from a box in their
// hand — and creating or editing one from a spreadsheet cell is a different and
// much larger decision than filling in a fabric. It is displayed because seeing
// that the sheet says PPS shipped on the 12th is useful on its own.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { pullWip, wipConfigured } from "@/lib/googleDrive";
import { wipSourceForBrand } from "@/lib/wipSources";
import {
  findEntry,
  parseWipSheet,
  sheetStatus,
  wipChanges,
  wipRounds,
  type WipChange,
  type WipRound,
} from "@/lib/wipImport";
import { STYLE_STATUSES, type StyleStatus } from "@/lib/types";

/** The fields a sheet may fill. Anything not on this list cannot be written. */
const WRITABLE = new Set(["name", "fabric", "colors", "factory", "notes", "tech_pack_url", "style_no"]);

export type WipView = {
  ok: boolean;
  /** Whether Google credentials exist on this deployment. */
  configured: boolean;
  /** Why there is nothing to show, when there is nothing to show. */
  reason: string;
  fileName: string;
  sheetName: string;
  /** The style's own row, if it was found. */
  found: boolean;
  changes: WipChange[];
  rounds: WipRound[];
  /** The sheet's status word, and what SSYNC would make of it — "" when unmapped. */
  status: { raw: string; mapped: string; current: string };
  fetchedAt: string;
};

const EMPTY: WipView = {
  ok: false,
  configured: false,
  reason: "",
  fileName: "",
  sheetName: "",
  found: false,
  changes: [],
  rounds: [],
  status: { raw: "", mapped: "", current: "" },
  fetchedAt: "",
};

type StyleRow = {
  id: string;
  style_no: string | null;
  name: string | null;
  fabric: string | null;
  colors: string | null;
  factory: string | null;
  notes: string | null;
  tech_pack_url: string | null;
  brand: string | null;
  status: string | null;
};

async function loadStyle(id: string): Promise<StyleRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("styles")
    .select("id,style_no,name,fabric,colors,factory,notes,tech_pack_url,brand,status")
    .eq("id", id)
    .maybeSingle();
  return (data as StyleRow | null) ?? null;
}

/** Everything the panel shows, assembled from a set of already-parsed entries. */
function view(
  style: StyleRow,
  entries: ReturnType<typeof parseWipSheet>,
  source: ReturnType<typeof wipSourceForBrand>,
  meta: { fileName: string; sheetName: string; fetchedAt: string }
): WipView {
  const entry = findEntry(entries, style);
  const st = sheetStatus(entry, source);
  return {
    ok: true,
    configured: wipConfigured(),
    reason: entry
      ? ""
      : `${style.style_no ? `Style ${style.style_no}` : "This style"} is not in ${meta.fileName || "the sheet"}.`,
    fileName: meta.fileName,
    sheetName: meta.sheetName,
    found: Boolean(entry),
    changes: wipChanges(style, entry, source),
    rounds: wipRounds(entry, source),
    status: { raw: st.raw, mapped: st.mapped, current: style.status ?? "" },
    fetchedAt: meta.fetchedAt,
  };
}

/**
 * Read the style's row live from Drive.
 *
 * Returns rather than throws for every failure a person can do something about
 * — no credentials, sheet not shared, style not in the sheet — because each of
 * those has a sentence that tells them what to do next, and an error boundary
 * does not.
 */
export async function readWip(styleId: string): Promise<WipView> {
  await requireTeam();
  const style = await loadStyle(styleId);
  if (!style) return { ...EMPTY, reason: "That style is no longer here." };

  const source = wipSourceForBrand(style.brand);
  if (!source) {
    return {
      ...EMPTY,
      configured: wipConfigured(),
      reason: style.brand
        ? `No WIP sheet is bound to ${style.brand}. A brand only ever pulls from its own sheet.`
        : "No WIP sheet is bound to this style.",
    };
  }

  const pull = await pullWip(source);
  if (!pull.ok) {
    return { ...EMPTY, configured: pull.configured, reason: pull.reason, fileName: source.fileName };
  }

  return view(style, pull.entries, source, {
    fileName: pull.fileName,
    sheetName: pull.sheetName,
    fetchedAt: pull.fetchedAt,
  });
}

/**
 * The same read, from text a person pasted.
 *
 * This is the path that works with no Google account at all: copy the rows out
 * of Excel or Sheets, paste them in. It is also the path that keeps working the
 * day somebody moves the file, which is why it is not being retired now that
 * the Drive fetch exists.
 */
export async function readWipFromText(styleId: string, text: string): Promise<WipView> {
  await requireTeam();
  const style = await loadStyle(styleId);
  if (!style) return { ...EMPTY, reason: "That style is no longer here." };

  const source = wipSourceForBrand(style.brand);
  if (!source) {
    return {
      ...EMPTY,
      configured: wipConfigured(),
      reason: style.brand
        ? `No WIP sheet is bound to ${style.brand}. A brand only ever pulls from its own sheet.`
        : "No WIP sheet is bound to this style.",
    };
  }

  const entries = parseWipSheet(text ?? "", source);
  if (!entries.length) {
    return {
      ...EMPTY,
      configured: wipConfigured(),
      fileName: source.fileName,
      reason: "No rows were found in that. Include the header row — the one with Style Number in it.",
    };
  }

  return view(style, entries, source, {
    fileName: source.fileName,
    sheetName: "pasted",
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * Write one field, because a person pressed the button beside it.
 *
 * The field name is checked against a list rather than trusted, so that a
 * malformed call cannot reach a column this feature has no business writing —
 * status, library_at, deleted_at, anything about ownership.
 */
export async function applyWipField(styleId: string, field: string, value: string): Promise<void> {
  await requireTeam();
  const v = (value ?? "").trim();
  if (!WRITABLE.has(field) || !v) return;

  const supabase = await createClient();
  await supabase
    .from("styles")
    .update({ [field]: v, updated_at: new Date().toISOString() })
    .eq("id", styleId);

  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/development");
}

/**
 * Set the status the sheet implies.
 *
 * Separate from applyWipField on purpose: a status moves a style between whole
 * views of the tool, and it is the one suggestion here that is a translation
 * rather than a copy. Only words the source's map defines can arrive, and the
 * value is checked against STYLE_STATUSES again here — twice, because this is
 * the field where being wrong is most visible.
 */
export async function applyWipStatus(styleId: string, status: string): Promise<void> {
  await requireTeam();
  if (!STYLE_STATUSES.includes(status as StyleStatus)) return;

  const supabase = await createClient();
  await supabase
    .from("styles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", styleId);

  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/development");
}
