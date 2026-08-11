import { requireTeam } from "@/lib/access";
import DevTabs from "../development/DevTabs";
import { loadStudioStyles } from "../development/loadStudioStyles";

export const dynamic = "force-dynamic";

// The Style Library — what the studio has already made.
//
// Tess, 2026-08-06: "add style library to the product section this is where
// completed styles live -- they can be seasonal or evergreen and can be easily
// re-purposed for future collections".
//
// WHAT COUNTS AS IN THE LIBRARY. Tess, 2026-08-06: "style library should only
// have finished styles that have been submitted to style library".
//
// The first build of this page computed it — Production or Archived meant "on
// the shelf" — and that was wrong in both directions. A style archived because
// it was abandoned turned up among the things worth remaking, and a block worth
// keeping could not be put here until its stage happened to say so. Membership
// is a judgement about the finished garment, not a stage in making it, so it is
// now its own field: styles.library_at, written by the Style Library box on the
// style's own page, beside Evergreen.
//
// The column is additive and nullable, so no existing row changed and no data
// moved. The consequence is that this page starts EMPTY and fills as she
// submits styles — which is the correct reading of "only ... that have been
// submitted", and is why the empty state below says so in words rather than
// leaving her looking at a blank grid wondering what broke.
//
// SEASONAL vs EVERGREEN is the evergreen flag that already exists, split in
// two. Evergreen is the tick on a style you expect to remake; seasonal is
// everything else. So the two words in her sentence are already in the data,
// and the tabs simply name them.
//
// NOTHING WAS TAKEN OUT OF DEVELOPMENT. Development still has its Production,
// Archived and Evergreen tabs, because somebody standing in the development
// grid looking for last season's anorak should still find it there. This page
// is an additional route to the same styles, organised for the thing she said
// it is for — reaching for a finished block and remaking it. If she would
// rather Development stopped showing finished work, that is one line in
// DevTabs' tab list and it can happen the moment she says so.
//
// The grid, the search, the facets and the cards are DevTabs — the same
// component Development renders, with a different tab strip. A second copy
// would drift the first time one of them was improved.
export default async function StyleLibraryPage() {
  await requireTeam(); // product side, team only
  const { gridStyles, summaryMap } = await loadStudioStyles();
  // Newest submission first: the shelf reads as what was put on it most
  // recently, which is the order somebody who just submitted one expects.
  const made = gridStyles
    .filter((s) => Boolean(s.library_at))
    .sort((a, b) => String(b.library_at ?? "").localeCompare(String(a.library_at ?? "")));

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title display">Style Library</h1>
      </div>
      <DevTabs
        styles={made}
        summaries={summaryMap}
        initialTab="all"
        tabs={[
          { key: "all", label: "All" },
          { key: "seasonal", label: "Seasonal" },
          { key: "evergreen", label: "Evergreen" },
        ]}
        note={
          made.length === 0 ? (
            <>
              Nothing has been submitted to the Library yet. Open a finished style and tick{" "}
              <strong>Style Library</strong>, beside Evergreen — it will appear here. Nothing is
              added automatically: this shelf is the styles you have decided are worth remaking.
            </>
          ) : (
            <>
              Finished styles you have submitted to the Library. Open one and choose{" "}
              <strong>Repurpose</strong> to copy it into a new season: the fit history and the
              references come with it, the sample rounds start clean, and the original is untouched.
            </>
          )
        }
      />
    </div>
  );
}
