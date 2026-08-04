// AI variations on a style (P5).
//
// The ask was "recolor / print / trim / detail on the evergreen styles" — the
// blocks the studio remakes every season, where the work is rarely a new
// garment and almost always the same garment in a different colour, a different
// print, different trim, one detail moved. Drawing all four every time is the
// part that eats a designer's week.
//
// What this module is, and is not:
//
//   It builds the **brief**, not the image. The brief is the part that has to be
//   right, and it is the part a machine gets wrong: asked for "this tank in
//   sage" an image model will happily return a different tank, a different
//   crop, a different body, a different hem — a picture that is no use to a
//   factory and actively misleading in a review. So every brief here names one
//   change and then names, explicitly, everything that must not move. The hold
//   list is not decoration; it is the whole reason to generate the prompt from
//   the style record rather than let someone type a sentence.
//
//   Nothing here calls a model, and nothing here writes. lib/imagegen.ts is the
//   shell that touches the world — and until an image-model key exists in the
//   environment it reports itself unconfigured rather than pretending, exactly
//   as lib/mailer.ts does for email. Meanwhile the brief is still worth having
//   on its own: it copies out, and it is the same text whether it is pasted
//   into a tool today or handed to a generator later.
//
// Where a variation lands: `style_versions`, with `is_ai_generated = true` —
// the column has been there since the first schema and this is what it was for.
// So a variation is a *version of the style*, sitting in the same history as
// every other change, and no new table or column was needed for any of this.
//
// Deliberately dependency-free (own structural types, no imports) so node's
// test runner can load it directly.

export type VariationAxis = {
  id: string;
  label: string;
  /** The one question this axis asks. */
  ask: string;
  placeholder: string;
  /** How the change is phrased in the prompt, with the value substituted. */
  instruction: (value: string) => string;
  /** What this particular axis must not be allowed to disturb. */
  keeps: string[];
};

/**
 * Four axes, and only four.
 *
 * A free-text "change anything" box produces a different garment; these are the
 * four changes that are actually made to a block between seasons, and naming
 * them is what lets each one carry its own hold list.
 */
export const VARIATION_AXES: readonly VariationAxis[] = [
  {
    id: "recolor",
    label: "Colour",
    ask: "New colour",
    placeholder: "bone · sage · washed indigo",
    instruction: (v) => `Recolour the garment to ${v}.`,
    keeps: [
      "the exact same dye depth across every panel — no gradient the original does not have",
      "trim, stitching and hardware in their existing colours unless they are the same cloth",
    ],
  },
  {
    id: "print",
    label: "Print",
    ask: "Print or pattern",
    placeholder: "botanical, small scale, tonal",
    instruction: (v) => `Apply a print to the garment: ${v}.`,
    keeps: [
      "the print scaled to the garment as it would actually be cut — not enlarged to fill the frame",
      "the print continuing correctly across seams and around the body",
    ],
  },
  {
    id: "trim",
    label: "Trim",
    ask: "Trim change",
    placeholder: "horn buttons instead of corozo · tonal topstitch",
    instruction: (v) => `Change the trim: ${v}.`,
    keeps: [
      "the placement and spacing of the existing trim — a substitution, not a redesign",
      "the cloth, colour and cut exactly as they are",
    ],
  },
  {
    id: "detail",
    label: "Detail",
    ask: "Detail change",
    placeholder: "patch pocket instead of welt · crop 2in shorter",
    instruction: (v) => `Change one construction detail: ${v}.`,
    keeps: [
      "every other detail untouched — one change only, so the two images can be compared",
      "the overall length and proportion unless the change is itself a length",
    ],
  },
];

/** What must hold no matter which axis was chosen. */
export const ALWAYS_HOLD: readonly string[] = [
  "the same garment: silhouette, proportion, length and the way the cloth hangs",
  "the same shot: framing, crop, camera height, background and lighting",
  "the same body and pose, so the two images can be laid side by side",
];

export type VariationStyle = {
  name: string;
  style_no?: string | null;
  category?: string | null;
  garment?: string | null;
  designer?: string | null;
  brand?: string | null;
  season?: string | null;
  notes?: string | null;
  fit_notes?: string | null;
  cover_image?: string | null;
};

export type VariationRequest = {
  axisId: string;
  /** What the change is, in the designer's words. */
  value: string;
  /** Anything else worth saying, optional. */
  extra?: string;
};

export type VariationBrief = {
  axis: VariationAxis | null;
  /** "Cropped Rib Tank — Colour: bone" */
  title: string;
  /** The garment, described from the record. */
  garment: string;
  /** The generation prompt: one change, then everything that must not move. */
  prompt: string;
  hold: string[];
  /** The image the variation is *of*, if there is one. */
  source: string | null;
  warnings: string[];
  /** Enough to generate from. */
  ready: boolean;
  /** What this would be called in the style's version history. */
  versionNote: string;
};

function clean(v?: string | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export function findAxis(axisId: string): VariationAxis | null {
  return VARIATION_AXES.find((a) => a.id === axisId) ?? null;
}

/**
 * The garment in a sentence, built from the record rather than typed.
 *
 * Typed descriptions drift: the same tank becomes "cropped tank", "rib tank",
 * "the white one" across three briefs and the three results stop being
 * comparable. Reading it off the style means every variation of a style opens
 * with the same words.
 */
export function describeGarment(style: VariationStyle): string {
  const name = clean(style.name) || "Untitled style";
  // Garment first, category only as a fallback. The two are usually the same
  // word wearing different clothes ("Tank" / "Tanks"), and a description that
  // says it twice reads like a machine wrote it — because one did.
  const what = clean(style.garment) || clean(style.category) || "garment";
  const who = clean(style.brand) || clean(style.designer);
  const season = clean(style.season);
  let s = `${name} — a ${what.toLowerCase()}`;
  if (who) s += ` by ${who}`;
  if (season) s += `, ${season}`;
  return s + ".";
}

/**
 * What is missing, said plainly before anything is generated.
 *
 * A brief with no source image is not a variation of the garment — it is a new
 * garment that happens to match a description, and it will not survive being
 * put next to the original. That is worth saying out loud rather than letting
 * someone find out after the render.
 */
function warningsFor(style: VariationStyle, axis: VariationAxis | null, value: string): string[] {
  const w: string[] = [];
  if (!axis) w.push("Pick what you are changing first.");
  if (!clean(value)) w.push(`Say what the ${axis ? axis.label.toLowerCase() : "change"} should be.`);
  if (!clean(style.cover_image))
    w.push(
      "This style has no cover image, so anything generated is drawn from the description alone — it will not match the real garment. Add a cover image first if the result has to be comparable."
    );
  if (!clean(style.garment) && !clean(style.category))
    w.push("No garment or category recorded, so the description is vague. Fill those in on the profile for a tighter brief.");
  return w;
}

export function buildBrief(style: VariationStyle, req: VariationRequest): VariationBrief {
  const axis = findAxis(clean(req.axisId));
  const value = clean(req.value);
  const extra = clean(req.extra);
  const garment = describeGarment(style);
  const source = clean(style.cover_image) || null;

  const hold = [...ALWAYS_HOLD, ...(axis ? axis.keeps : [])];

  const lines: string[] = [];
  lines.push(garment);
  if (axis && value) lines.push(axis.instruction(value));
  if (extra) lines.push(extra);
  lines.push("");
  lines.push("Change nothing else. Hold all of the following:");
  for (const h of hold) lines.push(`— ${h}`);
  lines.push("");
  lines.push(
    "This is a product development image, not an advertisement: no styling props, no added garments, no text or watermark, and no retouching that hides construction."
  );

  const title = axis
    ? `${clean(style.name) || "Untitled style"} — ${axis.label}: ${value || "…"}`
    : clean(style.name) || "Untitled style";

  return {
    axis,
    title,
    garment,
    prompt: lines.join("\n"),
    hold,
    source,
    warnings: warningsFor(style, axis, value),
    ready: Boolean(axis && value),
    versionNote: axis && value ? `AI variation — ${axis.label.toLowerCase()}: ${value}` : "AI variation",
  };
}

/**
 * The whole brief as one block of text, for the clipboard.
 *
 * Until a key exists this is the deliverable: it pastes into whatever tool the
 * studio already has open, and it is the same text the generator will be handed
 * later, so nothing about the request has to be re-decided when it is.
 */
export function briefText(brief: VariationBrief): string {
  const out: string[] = [];
  out.push(brief.title);
  out.push("");
  if (brief.source) {
    out.push(`Source image: ${brief.source}`);
    out.push("");
  }
  out.push(brief.prompt);
  return out.join("\n");
}
