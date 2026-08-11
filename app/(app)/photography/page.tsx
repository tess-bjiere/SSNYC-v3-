import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { SAMPLE_ROUNDS, type Style } from "@/lib/types";
import { REQUIRED_SLOTS } from "@/lib/photoSlots";
import { buildRollout, summarize } from "@/lib/photoRollout";
import { mergeLatestRoundPhotos } from "@/lib/styleRoundPhotos";
import { MOCK, mockStyles, mockStyleBundle } from "@/lib/mock";
import Photography from "./Photography";

export const dynamic = "force-dynamic";

// The photography standard, read across the whole library (P5).
//
// The profile page asks "is this style shot?". This page asks the question the
// studio actually works from: "what is left to shoot, and what should be shot
// first". Same five slots, same stored jsonb — no new table, no new column, and
// not one write from this page.
export default async function PhotographyPage() {
  await requireTeam(); // product side, team only
  let styles: Style[] = [];
  // Only what the merge needs: which style, where in the cycle, and the map.
  let rounds: { style_id: string; round: string | null; created_at: string | null; photos: unknown }[] = [];

  if (MOCK) {
    styles = mockStyles;
    rounds = mockStyles.flatMap((s) =>
      mockStyleBundle(s.id).samples.map((r) => ({
        style_id: r.style_id,
        round: r.round,
        created_at: r.created_at,
        photos: r.photos,
      }))
    );
  } else {
    const supabase = await createClient();
    const brand = await activeBrand();
    const [{ data }, { data: sampleRows }] = await Promise.all([
      // Nothing in the Trash goes on a shot list.
      supabase.from("styles").select("*").eq("brand", brand).is("deleted_at", null),
      supabase.from("style_samples").select("style_id,round,created_at,photos"),
    ]);
    styles = (data ?? []) as Style[];
    rounds = (sampleRows ?? []) as typeof rounds;
  }

  // The shot list reads the style and its latest round together (Tess,
  // 2026-08-05: photography moved onto the rounds). Without this, a garment
  // photographed on the PPS would be listed here as still to shoot, and
  // somebody would be sent to shoot it twice. Read-only: see
  // lib/styleRoundPhotos.ts — no row is written from this page, still.
  const merged = mergeLatestRoundPhotos(styles, rounds, SAMPLE_ROUNDS);

  // REQUIRED_SLOTS, not the whole shoot list: an optional slot (the second
  // detail) is a place to put a photograph, not a thing a style can be behind
  // on, and charting it would paint the whole studio red over a close-up most
  // garments have no use for.
  const rows = buildRollout(merged, REQUIRED_SLOTS);
  const summary = summarize(rows, REQUIRED_SLOTS);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Sample Images</h1>
      </div>
      <Photography rows={rows} summary={summary} slots={[...REQUIRED_SLOTS]} />
    </div>
  );
}
