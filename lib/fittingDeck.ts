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
  fitNotes?: string | null;
  factoryComments?: string | null;
  materialType?: string | null;
  materialContents?: string | null;
  materialSupplier?: string | null;
  // The style's colourway line and its tech-pack link, carried onto the page
  // (Tess, 2026-08-27: "include material, colors and link to techpack").
  colors?: string | null;
  techPack?: string | null;
};

export type DeckSlide = {
  name: string;
  /** style no · round · garment · factory — what this page is a fitting of. */
  subtitle: string;
  /** When this round was fitted, formatted for display; null when unrecorded. */
  fitDate: string | null;
  images: DeckImage[];
  fitNotes: string | null;
  factoryComments: string | null;
  /** "Nylon · 100% Poly · XX Premiere", or null when nothing is recorded. */
  material: string | null;
  /** The style's colourway line, or null. */
  colors: string | null;
  /** The tech-pack URL, or null — rendered as a link on the page. */
  techPack: string | null;
  /** True when there is genuinely nothing to show — no shots, no notes. */
  empty: boolean;
};

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

export function buildFittingSlide(input: DeckSlideInput): DeckSlide {
  const fitNotes = t(input.fitNotes);
  const factoryComments = t(input.factoryComments);
  const material = materialLine(input);
  return {
    name: t(input.name) ?? "Untitled style",
    subtitle: dots([input.styleNo, input.roundLabel, input.garment, input.factory]),
    fitDate: t(input.fittingDate),
    images: input.images,
    fitNotes,
    factoryComments,
    material,
    colors: t(input.colors),
    techPack: t(input.techPack),
    // A style someone selected but that has no shots and nothing written is not
    // dropped — the deck says so on its page rather than silently skipping a
    // style the person asked for.
    empty: input.images.length === 0 && !fitNotes && !factoryComments && !material,
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
