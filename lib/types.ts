// Shared row types matching the Supabase schema.

export type Reference = {
  id: string;
  image: string | null;
  thumb: string | null;
  image_url: string | null;
  thumb_url: string | null;
  designer: string;
  year: string | null;
  season: string | null;
  category: string | null;
  garment: string | null;
  fabric: string | null;
  color: string | null;
  color_hex: string | null;
  photographer: string | null;
  photographer_ig: string | null;
  model: string | null;
  location: string | null;
  link: string | null;
  price: string | null;
  notes: string | null;
  type: string | null;
  extra_images: ExtraImage[] | null;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string | null;
};

// extra_images rows are stored either as plain URL strings or as
// { image_url, thumb_url } objects (the shape the original importer wrote).
export type ExtraImage =
  | string
  | { image_url?: string | null; thumb_url?: string | null };

export const STYLE_STATUSES = ["inspo", "development", "production", "archived"] as const;
export type StyleStatus = (typeof STYLE_STATUSES)[number];

export const SAMPLE_ROUNDS = ["proto1", "proto2", "proto3", "sms", "pps1", "pps2", "bulk"] as const;
export type SampleRound = (typeof SAMPLE_ROUNDS)[number];

export const SAMPLE_ROUND_LABELS: Record<SampleRound, string> = {
  proto1: "1st Proto",
  proto2: "2nd Proto",
  proto3: "3rd Proto",
  sms: "SMS",
  pps1: "1st PPS",
  pps2: "2nd PPS",
  bulk: "Bulk",
};

export type Style = {
  id: string;
  style_no: string | null;
  name: string;
  category: string | null;
  garment: string | null;
  designer: string | null;
  brand: string | null;
  status: StyleStatus;
  stage: string | null;
  evergreen: boolean;
  season: string | null;
  factory: string | null;
  cover_image: string | null;
  tech_pack_url: string | null;
  notes: string | null;
  // The running fit story that carries across sample rounds — block, pattern,
  // the thing we keep getting wrong. Per-round fit is on StyleSample.
  fit_notes: string | null;
  // The photography standard's slots, keyed by slot id. See lib/photoSlots.ts —
  // always read this through normalizePhotos rather than indexing it directly.
  photos: Record<string, string> | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type StyleVersion = {
  id: string;
  style_id: string;
  version_no: number;
  changes: string | null;
  season: string | null;
  image: string | null;
  is_ai_generated: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type StyleSample = {
  id: string;
  style_id: string;
  round: string;
  factory: string | null;
  submitted_date: string | null;
  received_date: string | null;
  status: string | null;
  // What was said to or heard from the factory about this submission.
  comments: string | null;
  // How this round actually fitted — kept apart from `comments` so fit history
  // can be read on its own.
  fit_notes: string | null;
  // The raw-material leg: fabric and trim have to land at the factory before a
  // round can start, and that is where the time is usually lost.
  material_supplier: string | null;
  material_ordered_date: string | null;
  material_eta_date: string | null;
  material_received_date: string | null;
  created_at: string | null;
};

export type StyleComment = {
  id: string;
  style_id: string;
  version_id: string | null;
  author: string | null;
  body: string;
  status: string | null;
  created_at: string | null;
};

// Best available image URL for a reference row.
export function refImage(r: Pick<Reference, "image_url" | "image" | "thumb_url" | "thumb">): string {
  return r.image_url || r.image || r.thumb_url || r.thumb || "";
}

// Small image for anywhere that shows many references at once — the library
// grid, moodboard tiles, the trash. Prefers the generated thumbnail and falls
// back to the full image for rows that predate it. Detail views, which show one
// image large, should keep using refImage().
export function refThumb(r: Pick<Reference, "image_url" | "image" | "thumb_url" | "thumb">): string {
  return r.thumb_url || r.thumb || r.image_url || r.image || "";
}

// Normalize extra_images (strings or {image_url,thumb_url} objects) to a flat
// list of full-image URLs, dropping anything empty.
export function extraImageUrls(r: Pick<Reference, "extra_images">): string[] {
  const arr = r.extra_images;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((e) => (typeof e === "string" ? e : e?.image_url || e?.thumb_url || ""))
    .filter(Boolean) as string[];
}
