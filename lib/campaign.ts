// Campaign reference kind (Tess, 2026-09-14: "on campaign, option to sort by
// editorial / image references or styling references").
//
// A campaign image is either an Editorial reference (the image / photography
// inspiration) or a Styling reference (how things are put together). The kind is
// stored on references.ref_kind as the label itself, so it reads the same in the
// grid, on the edit card and in a bulk edit. It is free text underneath, so every
// reader folds case and treats anything unrecognised — including an untagged older
// image — as "" rather than inventing a third kind.
//
// Dependency-free like the rest of lib/: declares its own types, imports nothing.

export const CAMPAIGN_KINDS = ["Editorial", "Styling"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

/** Canonicalise a stored/typed value to a kind, or "" for untagged/unknown. */
export function normalizeCampaignKind(raw: unknown): CampaignKind | "" {
  if (typeof raw !== "string") return "";
  const t = raw.trim().toLowerCase();
  return t === "editorial" ? "Editorial" : t === "styling" ? "Styling" : "";
}
