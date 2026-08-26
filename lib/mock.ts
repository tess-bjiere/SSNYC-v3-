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
  // A sibling of style-0: the same garment (SS-1042) sampled at a second factory,
  // so the linesheet's click-through modal has more than one factory to show.
  ["Cropped Rib Tank", "SS-1042", "development", "Tank", "Atlas Garments", true],
].map((s, i) => ({
  id: "style-" + i,
  style_no: s[1] as string,
  name: s[0] as string,
  category: null,
  garment: s[3] as string,
  fabric: (["Butter Rib", "Cotton Twill", "Poplin", "French Terry", "Silk", "Nylon"] as string[])[i % 6],
  colors: (["Black / Bone", "Olive", "Washed Indigo / Chalk", "Sage", "Ecru", "Black"] as string[])[i % 6],
  material: i < 2 ? (["100% cotton", "98% cotton / 2% elastane"] as string[])[i] : null,
  // The spec fields, filled on the first two so DEMO mode shows what a fully
  // specified style looks like and what a half-specified one looks like.
  blank_style: i === 0 ? "IND4000 + F102 - Black" : null,
  hs_code: i < 2 ? "6109.10.00" : null,
  country_of_origin: i < 2 ? (["Portugal", "Vietnam"] as string[])[i] : null,
  weight_lbs: i < 2 ? [0.42, 1.1][i] : null,
  designer: "In-house",
  brand: "SOUS SOUS",
  status: s[2] as Style["status"],
  stage: null,
  evergreen: s[5] as boolean,
  season: "SS27",
  factory: (s[4] as string) || null,
  cover_image: ph(tones[i % tones.length]),
  tech_pack_url: "https://example.com/techpack",
  wip_url: "https://example.com/wip",
  notes: i === 0 ? "Repurpose of SS26 tank — new washed-pastel colorway." : null,
  fit_notes: i === 0 ? "Runs long through the body — the block still needs 1cm off the front rise." : null,
  // The first two styles are drawn, so MOCK mode exercises the profile-picture
  // resolution in lib/styleCover.ts rather than only its cover_image fallback:
  // one with a front/back pair, one with a front alone, and the rest still
  // falling through to the inherited cover. All three states on one grid.
  photos: (i === 0
    ? {
        sketch: ph(tones[(i + 3) % tones.length]),
        sketch_back: ph(tones[(i + 4) % tones.length]),
        // A styled photo and a croquis pair so the linesheet's styled/croquis
        // upload spots can be previewed in their filled state locally.
        styled: ph(tones[(i + 1) % tones.length]),
        croquis: ph(tones[(i + 2) % tones.length]),
        croquis_back: ph(tones[(i + 5) % tones.length]),
      }
    : i === 1
      ? { sketch: ph(tones[(i + 3) % tones.length]) }
      : null) as Record<string, string> | null,
  created_by: "tess@theloyalist.com",
  created_at: "2026-07-10",
  updated_at: "2026-07-20",
  // Nothing is on the Library shelf in the demo data either: it fills by
  // submission, not by status. See app/(app)/style-library/page.tsx.
  library_at: null,
  deleted_at: null,
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
      { id: "v2", style_id: style.id, version_no: 2, changes: "New colorway — sage", season: "SS27", image: null, is_ai_generated: true, notes: null, spawned_style_id: null, deleted_at: null, created_by: "tess@theloyalist.com", created_at: "2026-07-18" },
      { id: "v1", style_id: style.id, version_no: 1, changes: "Original — washed indigo", season: "SS26", image: null, is_ai_generated: false, notes: null, spawned_style_id: null, deleted_at: null, created_by: "tess@theloyalist.com", created_at: "2026-05-02" },
    ],
    samples: [
      { id: "s1", style_id: style.id, contact_name: "Ana Ferreira", contact_email: "ana@toyoshima.example", round: "proto1", factory: style.factory, submitted_date: "2026-06-01", received_date: "2026-06-12", status: "notes sent to factory", fitting_date: null, notes_sent_date: "2026-06-14", location: "office", tracking_number: null, rating: "workable", comments: null, fit_notes: "Body 2cm long, shoulder sitting wide.", material_supplier: "Toyoshima", material_type: "Cotton jersey", material_contents: "94% cotton, 6% elastane", material_notes: "Dye lot 4412. Two weeks from order to door, consistently.", eta_date: null, photos: null, material_ordered_date: "2026-05-02", material_eta_date: "2026-05-20", material_received_date: "2026-05-26", created_at: "2026-06-01" },
      { id: "s2", style_id: style.id, contact_name: "Ana Ferreira", contact_email: "ana@toyoshima.example", round: "proto2", factory: style.factory, submitted_date: "2026-06-20", received_date: "2026-07-01", status: "with designer", fitting_date: null, notes_sent_date: null, location: "photographer", tracking_number: null, rating: "good", comments: null, fit_notes: "Body corrected. Shoulder still 0.5cm wide but wearable.", material_supplier: "Toyoshima", material_type: "Cotton jersey", material_contents: "94% cotton, 6% elastane", material_notes: null, eta_date: null, photos: null, material_ordered_date: "2026-06-02", material_eta_date: "2026-06-14", material_received_date: "2026-06-16", created_at: "2026-06-20" },
      { id: "s3", style_id: style.id, contact_name: "Marta Reis", contact_email: null, round: "sms", factory: style.factory, submitted_date: "2026-07-05", received_date: null, status: "fitting scheduled", fitting_date: "2026-08-12", notes_sent_date: null, location: "factory", tracking_number: null, rating: null, comments: null, fit_notes: null, material_supplier: "Toyoshima", material_type: "Cotton jersey", material_contents: "94% cotton, 6% elastane", material_notes: null, eta_date: "2026-07-28", photos: null, material_ordered_date: "2026-06-25", material_eta_date: "2026-07-02", material_received_date: null, created_at: "2026-07-05" },
    ],
    comments: [
      // c1 is filed against the 2nd proto, c2 replies to it. A reply carries no
      // scope of its own — it inherits the root's — so c2's null is correct and
      // it still reads under the 2nd proto. See lib/commentTree.ts.
      { id: "c1", style_id: style.id, version_id: null, parent_id: null, sample_id: "s2", author: "kara@theloyalist.com", body: "Neckline needs to come up 1cm on the next proto.", status: "received", created_at: "2026-07-02" },
      { id: "c2", style_id: style.id, version_id: null, parent_id: "c1", sample_id: null, author: "tess@theloyalist.com", body: "Agreed — flagged to the factory. Tech pack: https://drive.google.com/drive/folders/ssync-demo", status: "open", created_at: "2026-07-03" },
    ],
  };
}

// Two linesheets for local preview (Tess, 2026-08-12). The linesheets table does
// not exist in mock mode, so the /linesheets pages read these instead — enough to
// see the list, the assortment grid and the one-per-page detail render against
// the real mock styles above.
export type MockLinesheetRow = {
  id: string;
  brand: string;
  name: string;
  kind: string;
  subtitle: string | null;
  items: {
    style_id: string;
    price?: string;
    note?: string;
    colorways?: string[];
    colors?: (string | { name: string; hex?: string })[];
  }[];
  notes: unknown[];
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const mockLinesheets: MockLinesheetRow[] = [
  {
    id: "linesheet-0",
    brand: "sous-sous",
    name: "FW26 Collection",
    kind: "seasonal",
    subtitle: "FW26",
    items: [
      { style_id: "style-0", price: "$105", note: "Elevated base layer; pairs back to the trouser and the crewneck." },
      { style_id: "style-1", price: "$185" },
      { style_id: "style-2" },
      {
        style_id: "style-3",
        price: "$225",
        colors: [
          { name: "Charcoal", hex: "#3a3a3c" },
          { name: "Ecru", hex: "#e6e0cf" },
          "Olive",
        ],
      },
    ],
    notes: [
      {
        tid: "n1",
        text: "Push the Terry Zip Hoodie to the front — it's the hero of the story.",
        by: "tess@theloyalist.com",
        ts: 1722960000000,
        replies: [
          { id: "r1", by: "kara@theloyalist.com", ts: 1722970000000, text: "Agreed. Move the tank down a row." },
        ],
      },
    ],
    archived: false,
    created_by: "tess@theloyalist.com",
    created_at: "2026-07-01",
    updated_at: "2026-08-01",
    deleted_at: null,
  },
  {
    id: "linesheet-1",
    brand: "sous-sous",
    name: "Evergreen Core",
    kind: "evergreen",
    subtitle: null,
    items: [{ style_id: "style-4" }, { style_id: "style-5" }],
    notes: [],
    archived: false,
    created_by: "tess@theloyalist.com",
    created_at: "2026-06-01",
    updated_at: "2026-07-15",
    deleted_at: null,
  },
];

export function mockLinesheet(id: string): MockLinesheetRow | null {
  return mockLinesheets.find((l) => l.id === id) ?? null;
}
