// One sample round, as something you can send to the factory.
//
// Tess, 2026-08-05: "User should have the ability to export notes / images from
// a specific sample round and email them to factory."
//
// There is already lib/styleExport.ts, which turns a whole style into a
// document. This is deliberately not that. A style export is the history —
// every round, every version, every comment — and it is what you send to a
// buyer, or file. What a factory needs is one round: what we asked for, what
// came back, what is wrong with it, and the pictures showing what is wrong with
// it. Sending them the whole season's history to explain a hem is how the hem
// gets missed.
//
// The same three rules as the style export, for the same reasons:
//
//   * nothing is silently missing. Tess, 2026-08-05: "these should only include
//     essential details from the sample round including marked up images. do not
//     include text that feels redundant." Every section used to print even when
//     it was empty, carrying a sentence of its own — so a round with fit notes
//     and nothing else went out as one paragraph and four headings apologising.
//     Empty sections now come out, and the names of the empty ones are collected
//     into one closing line: "Not recorded: fit notes, factory comments." The
//     factory is still told that nobody has fitted it — which was the whole
//     reason the empty sections were printed — in one line instead of four.
//   * nothing here reaches for the clock. `generatedOn` is passed in, decided
//     once on the server in the studio's timezone.
//   * every label is resolved by the caller. This module never imports the
//     round names or the status list — it is handed the words that should
//     appear, so it stays dependency-free and the tests run straight off the
//     .ts with no bundler. Same rule as lib/clone.ts and lib/styleFromRef.ts.
//
// The images go out as links, not attachments. They live in Supabase Storage on
// public URLs already — the same URLs the app itself loads them from — and a
// factory that can open the email can open the link. Attaching them would mean
// the app fetching every full-size photograph into memory and MIME-encoding it
// into a mailto, which no mail client would accept.
//
// NOTHING IN HERE SENDS ANYTHING. It builds the text and it builds a mailto:
// link. The mail opens in the studio's own mail client, addressed and filled
// in, and a person presses send. That is not a limitation to be fixed later: an
// app that silently emails a factory on a button press is an app nobody trusts
// with a factory relationship.

export type RoundExportImage = {
  url: string;
  /** What the picture is: "Model front", "Detail 2", a caption off the strip. */
  label: string;
  /** Anything written on the picture itself, already in one line. */
  note?: string | null;
  /**
   * The marks made on the photograph, in the order they are numbered, as
   * fractions of the image (0..1 from the top left). Carried so the page can
   * draw them where they were made — a note reading "1cm too wide" is worth
   * twice as much sitting on the waist. Text-only forms ignore them; the
   * sentences are already folded into `note`.
   */
  pins?: { x: number; y: number; text: string }[];
};

export type RoundExportInput = {
  styleName: string;
  styleNo?: string | null;
  season?: string | null;
  /** The round in the studio's own words — "2nd Proto", not "proto2". */
  roundLabel: string;
  factory?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  /**
   * The fitting status, already a label. Accepted and never printed — see the
   * note above buildRoundDoc.
   */
  status?: string | null;
  location?: string | null;
  /**
   * How the sample came out — "Good" / "Workable" / "Poor", already a label.
   * Accepted and never printed — see the note above buildRoundDoc.
   */
  rating?: string | null;
  requestedDate?: string | null;
  receivedDate?: string | null;
  etaDate?: string | null;
  materialType?: string | null;
  materialContents?: string | null;
  materialSupplier?: string | null;
  materialNotes?: string | null;
  fitNotes?: string | null;
  factoryComments?: string | null;
  images?: RoundExportImage[];
  /** Today, in the studio's timezone, decided on the server. */
  generatedOn: string;
};

export type RoundExportSection = {
  heading: string;
  lines: string[];
  /** Always false. Kept so a caller reading `.empty` still compiles. */
  empty: boolean;
};

export type RoundExportDoc = {
  title: string;
  subtitle: string;
  /** Only the sections that have something in them. */
  sections: RoundExportSection[];
  /** The headings that had nothing, lower-cased, for the one closing line. */
  missing: string[];
  images: RoundExportImage[];
  generatedOn: string;
};

function t(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** A section, or null when there is nothing in it. */
function section(heading: string, lines: string[]): RoundExportSection | null {
  const kept = lines.map(t).filter(Boolean);
  return kept.length ? { heading, lines: kept, empty: false } : null;
}

/** "fit notes and factory comments" / "the raw material, fit notes and photographs". */
export function missingLine(missing: readonly string[]): string {
  if (missing.length === 0) return "";
  const names = missing.map((m) => m.toLowerCase());
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Not recorded: ${list}.`;
}

/** "Anorak Jacket (SS-1042, SS27)" — how the style is named at the top and in the subject. */
export function styleLabel(input: RoundExportInput): string {
  const name = t(input.styleName) || "Untitled";
  const bits = [t(input.styleNo), t(input.season)].filter(Boolean).join(", ");
  return bits ? `${name} (${bits})` : name;
}

export function buildRoundDoc(input: RoundExportInput): RoundExportDoc {
  const images = (input.images ?? []).filter((im) => t(im.url));

  // WHAT IS NOT HERE, AND WHY. Four fields are accepted and deliberately never
  // printed. The contact name is the person the mail is addressed to, who does
  // not need to be told their own name. The location ("office",
  // "photographer") is where the studio has put the garment — an internal fact,
  // answering a question the factory has not asked.
  //
  // The fitting status and the rating went the same way (Tess, 2026-08-06:
  // "remove Status: Notes sent to factory / How it came out: Good from factory
  // notes export"). Both are the studio's own bookkeeping about its own
  // process. "Notes sent to factory" describes the very mail the factory is
  // holding, so it is a sentence telling the reader what the reader is already
  // reading; and a headline verdict of "Good" sitting above a list of
  // corrections either contradicts the list or softens it, when the fit notes
  // underneath are the actual, specific answer and are what the factory needs
  // to work from. The verdict is a word the studio says to itself.
  //
  // All four are still accepted on the input type and still passed by the
  // caller. Nothing was removed from the round, from the database, or from what
  // the studio sees — this only narrows what leaves the building, so putting
  // any of them back is one line each.
  const built = [
    section("Round", [
      t(input.factory) && `Factory: ${t(input.factory)}`,
      t(input.requestedDate) && `Sample requested: ${t(input.requestedDate)}`,
      t(input.receivedDate) && `Sample received: ${t(input.receivedDate)}`,
      // The ETA is only news while the sample is still out. Once it has
      // landed the arrival date above is the answer, and printing both
      // invites the factory to argue with the one that is no longer true.
      !t(input.receivedDate) && t(input.etaDate) && `Sample ETA: ${t(input.etaDate)}`,
    ].filter(Boolean) as string[]),
    section("Raw material", [
      t(input.materialType) && `Type: ${t(input.materialType)}`,
      t(input.materialContents) && `Contents: ${t(input.materialContents)}`,
      t(input.materialSupplier) && `Supplier: ${t(input.materialSupplier)}`,
      t(input.materialNotes),
    ].filter(Boolean) as string[]),
    section("Fit notes", [t(input.fitNotes)]),
    section("Factory comments", [t(input.factoryComments)]),
    section(
      "Photographs",
      images.map((im) => {
        const note = t(im.note);
        const label = t(im.label) || "Image";
        return note ? `${label} — ${note}\n${t(im.url)}` : `${label}\n${t(im.url)}`;
      })
    ),
  ];

  const headings = ["Round", "Raw material", "Fit notes", "Factory comments", "Photographs"];
  const sections = built.filter(Boolean) as RoundExportSection[];
  const have = new Set(sections.map((s) => s.heading));
  const missing = headings.filter((h) => !have.has(h));

  return {
    title: `${input.roundLabel} — ${styleLabel(input)}`,
    subtitle: `Sample round notes · ${input.generatedOn}`,
    sections,
    missing,
    images,
    generatedOn: input.generatedOn,
  };
}

/** The document as plain text — what gets copied, downloaded, or put in a mail body. */
export function renderRoundText(doc: RoundExportDoc): string {
  const out: string[] = [doc.title, doc.subtitle, ""];
  for (const s of doc.sections) {
    out.push(s.heading.toUpperCase());
    for (const line of s.lines) out.push(line);
    out.push("");
  }
  const gap = missingLine(doc.missing);
  if (gap) out.push(gap);
  return out.join("\n").trimEnd() + "\n";
}

/**
 * The subject line. Leads with the round and the style number, because a
 * factory's inbox is sorted by style number and nothing else.
 */
export function roundSubject(input: RoundExportInput): string {
  return `${styleLabel(input)} — ${input.roundLabel} notes`;
}

export function roundFilename(input: RoundExportInput): string {
  const raw = `${t(input.styleNo) || t(input.styleName) || "style"}-${input.roundLabel}`;
  const slug =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sample-round";
  return `${slug}-notes.txt`;
}

/**
 * A mailto: link — opened in the studio's own mail client, never sent from here.
 *
 * Mail clients and browsers both cap the length of a mailto URL, and they do it
 * by silently dropping the end rather than refusing: a long round would arrive
 * with its photographs missing and nobody would know. So the body is cut here,
 * on purpose, at a line boundary, and the cut says that it happened and where
 * the rest is. 1,800 characters is comfortably inside the smallest limit in
 * common use (~2,000 in older Outlook builds).
 *
 * `to` may be empty — a round with no contact still opens a mail, with the
 * address left for a person to fill in. That is better than hiding the button
 * until somebody has filled in a field they have not been asked for yet.
 */
export const MAILTO_LIMIT = 1800;

export function mailtoLink(
  to: string | null | undefined,
  subject: string,
  body: string,
  limit: number = MAILTO_LIMIT
): string {
  const head = `mailto:${encodeURIComponent(t(to))}?subject=${encodeURIComponent(subject)}&body=`;
  const room = Math.max(0, limit - head.length);

  let text = body;
  if (encodeURIComponent(text).length > room) {
    const tail = "\n\n[Cut short here — the full notes and every photograph are on the round's export page.]";
    const lines = body.split("\n");
    const kept: string[] = [];
    for (const line of lines) {
      const next = [...kept, line].join("\n") + tail;
      if (encodeURIComponent(next).length > room) break;
      kept.push(line);
    }
    text = kept.join("\n") + tail;
  }

  return head + encodeURIComponent(text);
}
