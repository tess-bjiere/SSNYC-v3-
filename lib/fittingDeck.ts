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
  roundLabel?: string | null;
  factory?: string | null;
  images: DeckImage[];
  fitNotes?: string | null;
  factoryComments?: string | null;
  materialType?: string | null;
  materialContents?: string | null;
  materialSupplier?: string | null;
};

export type DeckSlide = {
  name: string;
  /** style no · round · garment · factory — what this page is a fitting of. */
  subtitle: string;
  images: DeckImage[];
  fitNotes: string | null;
  factoryComments: string | null;
  /** "Nylon · 100% Poly · XX Premiere", or null when nothing is recorded. */
  material: string | null;
  /** True when there is genuinely nothing to show — no shots, no notes. */
  empty: boolean;
};

export type FittingDeck = {
  title: string;
  /** "3 styles · 2026-08-10". */
  subtitle: string;
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
    images: input.images,
    fitNotes,
    factoryComments,
    material,
    // A style someone selected but that has no shots and nothing written is not
    // dropped — the deck says so on its page rather than silently skipping a
    // style the person asked for.
    empty: input.images.length === 0 && !fitNotes && !factoryComments && !material,
  };
}

export function buildFittingDeck(
  inputs: DeckSlideInput[],
  opts: { generatedOn: string }
): FittingDeck {
  const slides = inputs.map(buildFittingSlide);
  const n = slides.length;
  return {
    title: "Fitting review",
    subtitle: `${n} ${n === 1 ? "style" : "styles"} · ${opts.generatedOn}`,
    slides,
  };
}
