// Demo data used only when NEXT_PUBLIC_MOCK === "1".
// Lets you preview the UI with no database connection (e.g. before Supabase/login is set up).
import type { Reference, Style, StyleVersion, StyleSample, StyleComment } from "@/lib/types";

export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

// tiny inline placeholder images (no network needed)
function ph(tone: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'><rect width='300' height='400' fill='${tone}'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
const tones = ["#2a2a2a", "#33312c", "#2c3330", "#332c2f", "#2e2f33", "#302c33"];

export const mockReferences: Reference[] = [
  ["Adidas", "2000s", "Short", "grey"],
  ["Free City", "1990s", "Tank", "faded blue"],
  ["Christian Dior", "1990s", "Windbreaker", "navy"],
  ["Ralph Lauren", "1990s", "Sock", "cream"],
  ["Isabel Marant", "2010s", "Sweater", "sage"],
  ["Acne Studios", "2010s", "Trouser", "stone"],
  ["The Row", "2020s", "Tank", "white"],
  ["Margiela", "2000s", "Coat", "black"],
].map((r, i) => ({
  id: "ref-" + i,
  image: ph(tones[i % tones.length]),
  thumb: null,
  image_url: null,
  thumb_url: null,
  designer: r[0],
  year: r[1],
  season: null,
  category: null,
  garment: r[2],
  fabric: null,
  color: r[3],
  color_hex: null,
  photographer: null,
  photographer_ig: null,
  model: null,
  location: null,
  link: null,
  price: null,
  notes: null,
  type: "reference",
  extra_images: [],
  created_by: "Tess",
  deleted_at: null,
  created_at: "2026-07-01",
}));

export const mockStyles: Style[] = [
  ["Cropped Rib Tank", "SS-1042", "development", "Tank", "Sunrise Mills", true],
  ["Pleated Wide Trouser", "SS-1051", "development", "Trouser", "Atlas Garments", false],
  ["Boxy Camp Shirt", "SS-1063", "inspo", "Shirt", "", false],
  ["Terry Zip Hoodie", "SS-1039", "production", "Hoodie", "Sunrise Mills", true],
  ["Bias Slip Dress", "SS-1070", "inspo", "Dress", "", false],
  ["Quilted Liner Vest", "SS-1024", "archived", "Vest", "Atlas Garments", false],
].map((s, i) => ({
  id: "style-" + i,
  style_no: s[1] as string,
  name: s[0] as string,
  category: null,
  garment: s[3] as string,
  designer: "In-house",
  brand: "SOUS SOUS",
  status: s[2] as Style["status"],
  stage: null,
  evergreen: s[5] as boolean,
  season: "SS27",
  factory: (s[4] as string) || null,
  cover_image: ph(tones[i % tones.length]),
  tech_pack_url: "https://example.com/techpack",
  notes: i === 0 ? "Repurpose of SS26 tank — new washed-pastel colorway." : null,
  fit_notes: i === 0 ? "Runs long through the body — the block still needs 1cm off the front rise." : null,
  photos: null,
  created_by: "tess@theloyalist.com",
  created_at: "2026-07-10",
  updated_at: "2026-07-20",
}));

// Every style's rounds in one list, for the views that read across styles rather
// than down one — /factories. Only styles with a factory have been sampled.
export function mockSamples(): StyleSample[] {
  return mockStyles
    .filter((s) => s.factory)
    .flatMap((s) => mockStyleBundle(s.id).samples.map((x) => ({ ...x, id: `${s.id}-${x.id}` })));
}

export function mockStyleBundle(id: string): {
  style: Style;
  versions: StyleVersion[];
  samples: StyleSample[];
  comments: StyleComment[];
} {
  const style = mockStyles.find((s) => s.id === id) ?? mockStyles[0];
  return {
    style,
    versions: [
      { id: "v2", style_id: style.id, version_no: 2, changes: "New colorway — sage", season: "SS27", image: null, is_ai_generated: true, notes: null, created_by: "tess@theloyalist.com", created_at: "2026-07-18" },
      { id: "v1", style_id: style.id, version_no: 1, changes: "Original — washed indigo", season: "SS26", image: null, is_ai_generated: false, notes: null, created_by: "tess@theloyalist.com", created_at: "2026-05-02" },
    ],
    samples: [
      { id: "s1", style_id: style.id, round: "proto1", factory: style.factory, submitted_date: "2026-06-01", received_date: "2026-06-12", status: "fit off — lengthen body", comments: null, fit_notes: "Body 2cm long, shoulder sitting wide.", material_supplier: "Toyoshima", material_ordered_date: "2026-05-02", material_eta_date: "2026-05-20", material_received_date: "2026-05-26", created_at: "2026-06-01" },
      { id: "s2", style_id: style.id, round: "proto2", factory: style.factory, submitted_date: "2026-06-20", received_date: "2026-07-01", status: "fit approved", comments: null, fit_notes: "Body corrected. Shoulder still 0.5cm wide but wearable.", material_supplier: "Toyoshima", material_ordered_date: "2026-06-02", material_eta_date: "2026-06-14", material_received_date: "2026-06-16", created_at: "2026-06-20" },
      { id: "s3", style_id: style.id, round: "sms", factory: style.factory, submitted_date: "2026-07-05", received_date: null, status: "in progress", comments: null, fit_notes: null, material_supplier: "Toyoshima", material_ordered_date: "2026-06-25", material_eta_date: "2026-07-02", material_received_date: null, created_at: "2026-07-05" },
    ],
    comments: [
      { id: "c1", style_id: style.id, version_id: null, author: "kara@theloyalist.com", body: "Neckline needs to come up 1cm on the next proto.", status: "received", created_at: "2026-07-02" },
      { id: "c2", style_id: style.id, version_id: null, author: "tess@theloyalist.com", body: "Agreed — flagged to the factory.", status: "open", created_at: "2026-07-03" },
    ],
  };
}
