// The fitting deck — several styles' most-recent rounds compiled into one
// print-to-PDF review (Tess, 2026-08-10: "is it possible to select multiple
// products to include into a recent beautiful fitting deck").
//
// Pure and dependency-free like the rest of lib/. It is handed already-resolved
// data — image URLs with their mark-up pins, the round's fit notes, the material
// fields — and returns the deck model the page lays out. The database read and
// the pin assembly live in the page (they reuse the round export's proven path);
// the shape and the small judgements — the identifying subtitle, the one-line
// material summary — are here where they can be unit-tested.

export type DeckPin = { x: number; y: number; text: string };
export type DeckImage = { url: string; label: string; note: string | null; pins: DeckPin[] };

/** A prior round condensed for the history strip — the words, the verdict, and
 *  when, with no photos. Reading down these is how a recurring complaint or an
 *  unanswered question shows itself (Tess, 2026-08-28: "more history on each
 *  style ... to show open questions / recurring issues"). */
export type DeckHistoryRoundInput = {
  roundLabel?: string | null;
  /** The fitting date, already formatted for display. */
  fittingDate?: string | null;
  rating?: string | null;
  fitNotes?: string | null;
  factoryComments?: string | null;
};
export type DeckHistoryRound = {
  roundLabel: string | null;
  fitDate: string | null;
  rating: string | null;
  fitNotes: string | null;
  factoryComments: string | null;
};

/** One style's contribution to the deck, before it is shaped into a slide. */
export type DeckSlideInput = {
  styleNo?: string | null;
  name: string;
  garment?: string | null;
  season?: string | null;
  brand?: string | null;
  roundLabel?: string | null;
  factory?: string | null;
  /** The fitting date of this round, already formatted for display (Tess,
   *  2026-08-24: "fit decks should include date of fitting for each style"). */
  fittingDate?: string | null;
  images: DeckImage[];
  // How the garment should fit — the design target, shown above the fit notes on
  // the deck (Tess, 2026-08-28: "the description of the fit to live above the fit
  // notes when exporting the fitting deck"). Style-level, so it is the same on
  // every round's page.
  intendedFit?: string | null;
  fitNotes?: string | null;
  factoryComments?: string | null;
  materialType?: string | null;
  materialContents?: string | null;
  materialSupplier?: string | null;
  // The style-level material line (styles.material, the free-text spec on the
  // profile) — used when the round carries no structured material of its own, so
  // a style whose fabric was entered there still shows it (Tess, 2026-08-28:
  // "exports are missing the materials listed").
  materialText?: string | null;
  // The style's colourway line and its tech-pack link, carried onto the page
  // (Tess, 2026-08-27: "include material, colors and link to techpack").
  colors?: string | null;
  techPack?: string | null;
  // The style's sketch/croquis — a small drawing shown under the header before
  // the fit notes (Tess, 2026-08-28: "a small sketch should be included under the
  // header info before the fit notes"). Front and back (Tess, 2026-08-28: "show
  // back of sketch as well").
  sketch?: string | null;
  sketchBack?: string | null;
  // Prior rounds, newest-first, for the history strip. Empty/absent in the
  // default latest-only export (Tess, 2026-08-28: "export sample + history").
  history?: DeckHistoryRoundInput[];
};

export type DeckSlide = {
  name: string;
  /** style no · round · garment · factory — what this page is a fitting of. */
  subtitle: string;
  /** When this round was fitted, formatted for display; null when unrecorded. */
  fitDate: string | null;
  images: DeckImage[];
  /** How the garment should fit — the design target, above the fit notes. */
  intendedFit: string | null;
  fitNotes: string | null;
  factoryComments: string | null;
  /** "Nylon · 100% Poly · XX Premiere", or null when nothing is recorded. */
  material: string | null;
  /** The style's colourway line, or null. */
  colors: string | null;
  /** The tech-pack URL, or null — rendered as a link on the page. */
  techPack: string | null;
  /** The style's front sketch/croquis URL, or null — a small drawing under the header. */
  sketch: string | null;
  /** The back sketch/croquis URL, or null — shown beside the front when present. */
  sketchBack: string | null;
  /** Prior rounds, newest-first, condensed; empty in the latest-only export. */
  history: DeckHistoryRound[];
  /** True when there is genuinely nothing to show — no shots, no notes. */
  empty: boolean;
};

/** One rendered line of a note — a bullet (with its depth for nesting) or a
 *  plain paragraph. The page draws each as its own block so a wrapped bullet's
 *  continuation aligns under the first line's text, not under the marker (Tess,
 *  2026-08-28: "when bullets wrap the second line aligns with the first"). */
export type DeckNoteLine = {
  /** A paragraph line, a bullet, or a blank line the writer left between notes. */
  kind: "text" | "bullet" | "break";
  /** Nesting level, 0 for a top-level line; only meaningful for bullets. */
  depth: number;
  /** The bullet glyph as authored ("•" top level, "-" nested); "" otherwise. */
  marker: string;
  text: string;
};

// docToText (lib/richNote) flattens a note to bulleted text: "• " at the top
// level, "  - " (two spaces per level) below. This reads that back into lines so
// the deck can render each as a hanging-indent row.
const NOTE_BULLET_RE = /^(\s*)([•\-])\s+(.*)$/;

export function noteLines(value: string | null | undefined): DeckNoteLine[] {
  const s = typeof value === "string" ? value : "";
  if (!s.trim()) return [];
  const out: DeckNoteLine[] = [];
  // A break, unless the last thing pushed is already one — so leading breaks and
  // runs of them collapse to a single gap.
  const pushBreak = () => {
    if (out.length && out[out.length - 1].kind !== "break") {
      out.push({ kind: "break", depth: 0, marker: "", text: "" });
    }
  };
  for (const raw of s.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      // A blank line the writer put between notes is kept as a break, so the
      // export shows the same spacing they typed (Tess, 2026-08-28: "if user has
      // a line break between notes -- be sure to export it that way as well").
      pushBreak();
      continue;
    }
    const m = NOTE_BULLET_RE.exec(line);
    if (m) {
      // Two spaces per nesting level, matching docToText's indentation. Tabs are
      // counted as two spaces so a hand-typed note still nests sensibly.
      const depth = Math.floor(m[1].replace(/\t/g, "  ").length / 2);
      out.push({ kind: "bullet", depth, marker: m[2], text: m[3].trim() });
    } else {
      // A paragraph that follows a bulleted list is a new aside or section — the
      // editor gives it block spacing above, but docToText joins the list and the
      // paragraph with a single newline, dropping that space. Restore it so the
      // export reads like the note did (Tess, 2026-08-28: "needs space above
      // 'edits' and above 'postmortem' -- the space was included in the notes").
      // Only after a bullet: a paragraph directly under another paragraph, or a
      // list directly under its intro line, keeps its existing tight spacing.
      if (out.length && out[out.length - 1].kind === "bullet") pushBreak();
      out.push({ kind: "text", depth: 0, marker: "", text: line.trim() });
    }
  }
  // A note ending on a blank line leaves no trailing gap.
  while (out.length && out[out.length - 1].kind === "break") out.pop();
  return out;
}

/** One line on the cover's contents list — a product in the deck. */
export type DeckContentsItem = { name: string; styleNo: string | null };

export type FittingDeck = {
  title: string;
  /** "3 styles · 2026-08-10". */
  subtitle: string;
  /** The season(s) across the selected styles, joined; null when none say. */
  season: string | null;
  /** The brand(s) across the selected styles, joined; null when none say. */
  brand: string | null;
  /** The products on the cover, in the order they were picked. */
  contents: DeckContentsItem[];
  slides: DeckSlide[];
};

function t(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

function dots(parts: (string | null | undefined)[]): string {
  return parts.map(t).filter(Boolean).join(" · ");
}

/** The raw-material line for a round — fabric, what it is made of, who supplied it. */
export function materialLine(s: {
  materialType?: string | null;
  materialContents?: string | null;
  materialSupplier?: string | null;
}): string | null {
  return dots([s.materialType, s.materialContents, s.materialSupplier]) || null;
}

/** The prior rounds condensed and cleaned — order preserved (the caller passes
 *  them newest-first), each field trimmed, and any round with nothing to say
 *  (no rating and no notes) dropped, since an empty row adds only clutter. */
function buildHistory(rounds: DeckHistoryRoundInput[] | undefined): DeckHistoryRound[] {
  if (!rounds || !rounds.length) return [];
  const out: DeckHistoryRound[] = [];
  for (const r of rounds) {
    const rating = t(r.rating);
    const fitNotes = t(r.fitNotes);
    const factoryComments = t(r.factoryComments);
    // A round the reader can learn nothing from is not worth a row.
    if (!rating && !fitNotes && !factoryComments) continue;
    out.push({
      roundLabel: t(r.roundLabel),
      fitDate: t(r.fittingDate),
      rating,
      fitNotes,
      factoryComments,
    });
  }
  return out;
}

export function buildFittingSlide(input: DeckSlideInput): DeckSlide {
  const intendedFit = t(input.intendedFit);
  const fitNotes = t(input.fitNotes);
  const factoryComments = t(input.factoryComments);
  // The round's own fabric line, else the style's free-text material spec.
  const material = materialLine(input) ?? t(input.materialText);
  return {
    name: t(input.name) ?? "Untitled style",
    subtitle: dots([input.styleNo, input.roundLabel, input.garment, input.factory]),
    fitDate: t(input.fittingDate),
    images: input.images,
    intendedFit,
    fitNotes,
    factoryComments,
    material,
    colors: t(input.colors),
    techPack: t(input.techPack),
    sketch: t(input.sketch),
    sketchBack: t(input.sketchBack),
    history: buildHistory(input.history),
    // A style someone selected but that has no shots and nothing written is not
    // dropped — the deck says so on its page rather than silently skipping a
    // style the person asked for.
    empty: input.images.length === 0 && !intendedFit && !fitNotes && !factoryComments && !material,
  };
}

/** Distinct non-empty values, in first-seen order. Case-insensitive on the key. */
function uniq(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = t(v);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function buildFittingDeck(
  inputs: DeckSlideInput[],
  opts: { generatedOn: string }
): FittingDeck {
  const slides = inputs.map(buildFittingSlide);
  const n = slides.length;
  // The season and brand are drawn from the styles themselves — usually one of
  // each across a review, but a deck spanning two seasons says both rather than
  // picking one (Tess, 2026-08-10: "a cover with the season/brand").
  const seasons = uniq(inputs.map((i) => i.season));
  const brands = uniq(inputs.map((i) => i.brand));
  return {
    title: "Fitting review",
    subtitle: `${n} ${n === 1 ? "style" : "styles"} · ${opts.generatedOn}`,
    season: seasons.length ? seasons.join(" · ") : null,
    brand: brands.length ? brands.join(" · ") : null,
    // The products on the cover, in pick order (Tess, 2026-08-10: "products
    // included"). Every selected style is listed, even one with no fitting yet.
    contents: inputs.map((i) => ({ name: t(i.name) ?? "Untitled style", styleNo: t(i.styleNo) })),
    slides,
  };
}
