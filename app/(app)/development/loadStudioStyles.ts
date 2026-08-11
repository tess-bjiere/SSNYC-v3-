import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { SAMPLE_ROUNDS, SAMPLE_ROUND_LABELS, type Style, type StyleSample } from "@/lib/types";
import { summarizeAll, type DevSummary } from "@/lib/devSort";
import { mergeLatestRoundPhotos } from "@/lib/styleRoundPhotos";
import { MOCK, mockStyles, mockStyleBundle } from "@/lib/mock";

// One load of the studio's styles, shared by the two pages that show them.
//
// Development and the Style Library are the same rows read for different
// questions — what is being made now, and what has been made — so they must
// agree about pictures, rounds and ETAs down to the last card. Two copies of
// this query would eventually disagree, and the version that disagreed would be
// the one somebody was standing in front of. It lives here so there is one.
//
// Extracted verbatim from the Development page (2026-08-06) when the Style
// Library was added; nothing about the query changed in the move.

// "Today" is a calendar day in the studio's timezone, decided once on the
// server, so a sample is late in New York rather than late in UTC.
function studioToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export type StudioStyles = {
  /** Every live style, as stored. */
  styles: Style[];
  /** The same styles with their latest round's photos merged in, for the grid. */
  gridStyles: Style[];
  /** Round/ETA summary per style id. */
  summaryMap: Record<string, DevSummary>;
};

export async function loadStudioStyles(): Promise<StudioStyles> {
  let styles: Style[] = [];
  let samples: StyleSample[] = [];

  if (MOCK) {
    styles = mockStyles;
    samples = mockStyles.flatMap((s) => mockStyleBundle(s.id).samples);
  } else {
    const supabase = await createClient();
    // Only this brand's styles (multi-brand phase 1). The samples are matched to
    // these styles by id, so a round belonging to another brand's style never
    // finds a card to land on.
    const brand = await activeBrand();
    const [{ data: styleRows }, { data: sampleRows }] = await Promise.all([
      // Styles in the Trash are not in development. .is("deleted_at", null)
      // rather than a filter in JS, so a trashed style never crosses the wire
      // and can never appear for a frame before the list settles.
      supabase
        .from("styles")
        .select("*")
        .eq("brand", brand)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      // Every round for every style, in one query rather than one per card.
      // Narrow on purpose: the grid needs the cycle position and the dates, not
      // the notes.
      //
      // `photos` joined the list on 2026-08-05, when photography moved onto the
      // rounds — the thumbnail's picture now lives on the latest round, so a
      // grid that did not read this column would show a sketch for a garment
      // that has been photographed.
      supabase
        .from("style_samples")
        .select("style_id,round,status,rating,submitted_date,received_date,eta_date,fit_notes,photos,created_at"),
    ]);
    styles = (styleRows ?? []) as Style[];
    samples = (sampleRows ?? []) as StyleSample[];
  }

  // One summary per style, computed server-side where the rounds already are.
  // The card and the sort both read it, which is what keeps the amber chip and
  // the "needs attention" order from ever telling different stories.
  const summaries = summarizeAll(
    styles,
    samples,
    SAMPLE_ROUNDS,
    SAMPLE_ROUND_LABELS,
    studioToday()
  );
  const summaryMap: Record<string, DevSummary> = Object.fromEntries(summaries);

  // The thumbnail's picture, resolved the same way the profile resolves it: the
  // style's own map with its latest round's laid over the top. The sketch still
  // wins over any photograph — the merge only decides *which* lay flat — so a
  // style that has been drawn goes on showing its drawing. See
  // lib/styleRoundPhotos.ts and lib/styleCover.ts.
  const gridStyles = mergeLatestRoundPhotos(styles, samples, SAMPLE_ROUNDS);


  return { styles, gridStyles, summaryMap };
}
