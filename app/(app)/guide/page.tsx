import { getSessionUser } from "@/lib/access";

// How to use — the new tool's guide (Tess, 2026-08-12: "in the original ssync we
// had a guide on how to use. let's do an updated guide for the new tool. keep it
// super simple and to the point -- as short as possible").
//
// The original was a long modal that only ever described a reference library.
// SSYNC is the whole pipeline now, so the guide names each section in one line
// and stops. A talent sees only the Ideation half of their brand, so the guide
// hides Product and Styles for them — same rule the nav follows, no door shown
// that cannot be opened.
//
// A page, not a modal: it reads on a phone, and the footer's "How to use" link
// can be shared like any other.

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const user = await getSessionUser();
  const isTeam = user?.role === "team";

  return (
    <div className="guide">
      <h1 className="page-title">How to use</h1>

      <p className="guide-intro">
        SSYNC is a shared workspace — the whole team sees the same references,
        boards, styles and notes, and everything saves as you go.
      </p>

      <h2>Ideation — gathering ideas</h2>
      <ul>
        <li>
          <b>References</b> — the reference archive. Add an image, tag it, and
          find it later by search.
        </li>
        <li>
          <b>Moodboard</b> — pull references together onto boards.
        </li>
        <li>
          <b>Campaign</b> — campaign and editorial inspiration (photographer,
          model, location).
        </li>
      </ul>

      {isTeam && (
        <>
          <h2>Product — making the styles</h2>
          <ul>
            <li>
              <b>Development</b> — styles in progress.
            </li>
            <li>
              <b>Styles by Factory</b> — the same work, grouped by who is making
              it.
            </li>
            <li>
              <b>Style Library</b> — finished styles, kept to reuse next season.
            </li>
            <li>
              <b>Linesheets</b> — assemble styles into a buyer-ready sheet and
              export it to PDF.
            </li>
          </ul>

          <h2>A linesheet</h2>
          <ul>
            <li>
              Start a seasonal or evergreen sheet, then <b>Add styles</b> to pull
              them in from Development or the Style Library.
            </li>
            <li>
              Two views: <b>Grid</b> (the assortment at a glance) and{" "}
              <b>Detail</b> (one product a page). Drag the handle to reorder.
            </li>
            <li>
              In Detail, set the retail price, add a description, and add or
              remove colours — pick a swatch by hex and give it your own name.
            </li>
            <li>
              <b>Group by color</b> to sort the assortment, and{" "}
              <b>Save as PDF</b> for a landscape deck with a cover page.
            </li>
          </ul>

          <h2>A style</h2>
          <ul>
            <li>
              Open any style for its profile: details, sketches and every sample
              round in one place.
            </li>
            <li>
              Log a round, upload sample photos, and pin notes right on the
              image.
            </li>
            <li>
              Comment to anyone on the team; export a style or a round to PDF.
            </li>
          </ul>
        </>
      )}

      <h2>Everywhere</h2>
      <ul>
        <li>Search, filter and sort sit at the top of each page.</li>
        <li>The column icons resize the grid — more or fewer per row.</li>
        <li>
          Nothing is ever deleted. Trash holds it, and Restore brings it back.
        </li>
      </ul>
    </div>
  );
}
