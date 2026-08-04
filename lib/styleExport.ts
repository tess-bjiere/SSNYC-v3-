// ---------------------------------------------------------------------------
// A style's history as a document (P4 — export a style's history)
//
// The ask was "export a style's history to a Google Doc". Writing straight into
// Drive needs a Google token the app does not have yet — Google login is P0 and
// is deliberately last — so this builds the *document* rather than the delivery.
// One pure function turns a style and everything hanging off it into an ordered
// document model; the export page renders that model as a paste-ready page, and
// the same model renders to plain text for a download. When Google login lands,
// a Drive writer becomes a third renderer over this same model rather than a
// rewrite.
//
// Two rules shape it, and both are the opposite of what the screen does:
//
//   * Every section appears even when it is empty, with a sentence saying so. A
//     screen can hide what isn't there; a document that quietly omits a heading
//     reads as "nothing to report" when it means "nothing was recorded", and
//     these get sent to factories.
//   * Versions and comments read oldest-first. The profile shows newest-first,
//     because on screen you want the latest news; a history is read forward.
//
// Nothing here reaches for the clock: `generatedOn` is passed in, decided once
// on the server in the studio's timezone, the same way the sample cycle does it.
// ---------------------------------------------------------------------------

export type ExportStyle = {
  name: string;
  style_no?: string | null;
  category?: string | null;
  garment?: string | null;
  designer?: string | null;
  brand?: string | null;
  season?: string | null;
  factory?: string | null;
  status?: string | null;
  evergreen?: boolean | null;
  tech_pack_url?: string | null;
  notes?: string | null;
  fit_notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

export type ExportReference = {
  designer?: string | null;
  year?: string | null;
  season?: string | null;
  garment?: string | null;
  deleted_at?: string | null;
};

export type ExportSample = {
  round: string;
  factory?: string | null;
  status?: string | null;
  material_supplier?: string | null;
  material_ordered_date?: string | null;
  material_eta_date?: string | null;
  material_received_date?: string | null;
  submitted_date?: string | null;
  received_date?: string | null;
  fit_notes?: string | null;
  comments?: string | null;
};

export type ExportVersion = {
  version_no: number;
  season?: string | null;
  changes?: string | null;
  notes?: string | null;
  is_ai_generated?: boolean | null;
  created_at?: string | null;
};

export type ExportComment = {
  body: string;
  author?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type ExportPhoto = { label: string; url?: string | null };

export type ExportInput = {
  style: ExportStyle;
  /** In the order the profile shows them. */
  references?: ExportReference[];
  /** Already in cycle order — the caller owns the ordering (lib/sampleCycle). */
  samples?: ExportSample[];
  /** Already in slot order — the caller owns the standard (lib/photoSlots). */
  photos?: ExportPhoto[];
  versions?: ExportVersion[];
  comments?: ExportComment[];
  /** YYYY-MM-DD, decided by the caller. */
  generatedOn: string;
};

export type DocRow = { label: string; value: string };
/** A labelled paragraph — prose that would not fit on a row. */
export type DocNote = { label: string; text: string };
export type DocEntry = { heading: string; sub: string | null; rows: DocRow[]; notes: DocNote[] };
export type DocSection = {
  title: string;
  /** A single paragraph, for sections that are prose rather than a list. */
  body: string | null;
  rows: DocRow[];
  entries: DocEntry[];
  /** Shown when the section has no body, rows or entries. Never blank. */
  empty: string;
};
export type StyleDoc = {
  title: string;
  subtitle: string;
  sections: DocSection[];
  footer: string;
};

function t(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

function dots(parts: (string | null | undefined)[]): string {
  return parts.map(t).filter(Boolean).join(" · ");
}

/** A row is only worth printing if it has something in it. */
function rows(pairs: [string, unknown][]): DocRow[] {
  const out: DocRow[] = [];
  for (const [label, raw] of pairs) {
    const value = t(raw);
    if (value) out.push({ label, value });
  }
  return out;
}

function notes(pairs: [string, unknown][]): DocNote[] {
  const out: DocNote[] = [];
  for (const [label, raw] of pairs) {
    const text = t(raw);
    if (text) out.push({ label, text });
  }
  return out;
}

function section(
  title: string,
  empty: string,
  parts: { body?: string | null; rows?: DocRow[]; entries?: DocEntry[] } = {}
): DocSection {
  return {
    title,
    body: t(parts.body),
    rows: parts.rows ?? [],
    entries: parts.entries ?? [],
    empty,
  };
}

export function isEmptySection(s: DocSection): boolean {
  return !s.body && s.rows.length === 0 && s.entries.length === 0;
}

/** The line under the title: what this style is, in the terms the studio uses. */
export function styleSubtitle(style: ExportStyle): string {
  return dots([style.style_no, style.season, style.garment, style.factory]);
}

export function referenceLabel(r: ExportReference): string {
  const name = t(r.designer) ?? "Untitled reference";
  const year = t(r.year);
  const sub = dots([year && year !== "Unknown" ? year : null, r.garment, r.season]);
  const label = sub ? `${name} — ${sub}` : name;
  // A reference that has since been trashed still belongs in the record; hiding
  // it would quietly rewrite where the style came from.
  return r.deleted_at ? `${label} (in Trash)` : label;
}

/**
 * Newest-last: a history is read forward, unlike the profile.
 *
 * The tiebreak is not decoration. Rows written in a single transaction — a
 * seed, an import, two versions saved in the same minute — all carry the same
 * `created_at`, and a sort on the timestamp alone then leaves them in whatever
 * order the database happened to hand back. That is how v2 came out above v1
 * the first time this page was opened against real rows. Where there is a
 * number that *is* the order, the number wins.
 */
function byOldestFirst<T extends { created_at?: string | null }>(
  list: T[],
  tiebreak?: (a: T, b: T) => number
): T[] {
  return [...list].sort((a, b) => {
    const byTime = (t(a.created_at) ?? "").localeCompare(t(b.created_at) ?? "");
    if (byTime !== 0) return byTime;
    return tiebreak ? tiebreak(a, b) : 0;
  });
}

function sampleEntry(s: ExportSample): DocEntry {
  return {
    heading: t(s.round) ?? "round",
    sub: dots([s.factory, s.status]) || null,
    rows: rows([
      ["Material supplier", s.material_supplier],
      ["Material ordered", s.material_ordered_date],
      ["Material ETA", s.material_eta_date],
      ["Material received", s.material_received_date],
      ["Submitted to factory", s.submitted_date],
      ["Received back", s.received_date],
    ]),
    notes: notes([
      ["Fit", s.fit_notes],
      ["Comments", s.comments],
    ]),
  };
}

export function buildStyleDoc(input: ExportInput): StyleDoc {
  const st = input.style;
  const refs = input.references ?? [];
  const samples = input.samples ?? [];
  const photos = input.photos ?? [];
  // v1 before v2, whatever the clock says. A comment has no such number, so a
  // tie there keeps the order the caller handed over — which is why the page
  // asks the database for them oldest-first rather than trusting row order.
  const versions = byOldestFirst(input.versions ?? [], (a, b) => a.version_no - b.version_no);
  const comments = byOldestFirst(input.comments ?? []);

  const details = section("Details", "No details recorded.", {
    rows: rows([
      ["Style no.", st.style_no],
      ["Category", st.category],
      ["Garment", st.garment],
      ["Designer", st.designer],
      ["Brand", st.brand],
      ["Season", st.season],
      ["Factory", st.factory],
      ["Status", st.status],
      ["Evergreen", st.evergreen ? "Yes" : null],
      ["Tech pack", st.tech_pack_url],
      ["Created by", st.created_by],
      ["Created", t(st.created_at)?.slice(0, 10)],
    ]),
    body: st.notes,
  });

  const fit = section(
    "Fit",
    "No fit notes recorded — the running fit story is empty for this style.",
    { body: st.fit_notes }
  );

  const developedFrom = section(
    "Developed from",
    "No library references linked to this style.",
    { rows: refs.map((r, i) => ({ label: `Reference ${i + 1}`, value: referenceLabel(r) })) }
  );

  const cycle = section("Sample cycle", "No sample rounds logged yet.", {
    entries: samples.map(sampleEntry),
  });

  const photography = section("Photography", "No photography standard applied.", {
    // Unshot slots are listed too — on the profile an empty slot is visible as a
    // gap, and in a document the gap has to be spelled out or it disappears.
    rows: photos.map((p) => ({ label: p.label, value: t(p.url) ? "Shot" : "Not shot yet" })),
  });

  const versionsSection = section("Versions", "No versions recorded.", {
    entries: versions.map((v) => ({
      heading: `v${v.version_no}`,
      sub: dots([v.season, t(v.created_at)?.slice(0, 10), v.is_ai_generated ? "AI generated" : null]) || null,
      rows: [],
      notes: notes([
        ["Changed", v.changes],
        ["Notes", v.notes],
      ]),
    })),
  });

  const commentsSection = section("Comments & feedback", "No comments yet.", {
    entries: comments.map((c) => ({
      heading: t(c.author) ?? "Unattributed",
      sub: dots([t(c.created_at)?.slice(0, 10), c.status]) || null,
      rows: [],
      notes: notes([["", c.body]]),
    })),
  });

  const counts = [
    `${samples.length} sample ${samples.length === 1 ? "round" : "rounds"}`,
    `${versions.length} ${versions.length === 1 ? "version" : "versions"}`,
    `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`,
  ].join(" · ");

  return {
    title: t(st.name) ?? "Untitled style",
    subtitle: styleSubtitle(st),
    sections: [details, fit, developedFrom, cycle, photography, versionsSection, commentsSection],
    footer: `${counts}. Exported from SSYNC on ${input.generatedOn}.`,
  };
}

// ---------------------------------------------------------------------------
// Plain-text rendering. The paste-into-Google-Docs path uses the rendered page
// so the formatting survives; this is the copy that has to survive anything —
// an email body, a message to a factory, a .txt beside a tech pack.
// ---------------------------------------------------------------------------
export function renderDocText(doc: StyleDoc): string {
  const out: string[] = [doc.title];
  if (doc.subtitle) out.push(doc.subtitle);

  for (const s of doc.sections) {
    out.push("", s.title.toUpperCase());
    if (isEmptySection(s)) {
      out.push(`  ${s.empty}`);
      continue;
    }
    for (const r of s.rows) out.push(`  ${r.label}: ${r.value}`);
    if (s.body) out.push(...(s.rows.length ? [""] : []), ...s.body.split("\n").map((l) => `  ${l}`.trimEnd()));
    for (const e of s.entries) {
      out.push("", `  ${e.heading}${e.sub ? ` — ${e.sub}` : ""}`);
      for (const r of e.rows) out.push(`    ${r.label}: ${r.value}`);
      for (const n of e.notes) {
        const lines = n.text.split("\n").map((l) => `    ${l}`.trimEnd());
        out.push(n.label ? `    ${n.label}: ${n.text.split("\n")[0]}` : lines[0]);
        for (const extra of lines.slice(1)) out.push(extra);
      }
    }
  }

  out.push("", doc.footer);
  return out.join("\n");
}

/** A filename a person can find again six months later. */
export function exportFilename(doc: StyleDoc, generatedOn: string): string {
  const slug = doc.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "style"}-${generatedOn}.txt`;
}
