import { createClient } from "@/lib/supabase/server";
import type { Style } from "@/lib/types";
import { PHOTO_SLOTS } from "@/lib/photoSlots";
import { buildRollout, summarize } from "@/lib/photoRollout";
import { MOCK, mockStyles } from "@/lib/mock";
import Photography from "./Photography";

export const dynamic = "force-dynamic";

// The photography standard, read across the whole library (P5).
//
// The profile page asks "is this style shot?". This page asks the question the
// studio actually works from: "what is left to shoot, and what should be shot
// first". Same five slots, same stored jsonb — no new table, no new column, and
// not one write from this page.
export default async function PhotographyPage() {
  let styles: Style[] = [];
  if (MOCK) {
    styles = mockStyles;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("styles").select("*");
    styles = (data ?? []) as Style[];
  }

  const rows = buildRollout(styles, PHOTO_SLOTS);
  const summary = summarize(rows, PHOTO_SLOTS);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title serif">Photography</h1>
        <span className="count">
          {summary.complete} of {summary.styles} complete
        </span>
      </div>
      <Photography rows={rows} summary={summary} slots={[...PHOTO_SLOTS]} />
    </div>
  );
}
