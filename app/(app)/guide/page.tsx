import { getSessionUser } from "@/lib/access";
import { APP } from "@/lib/appConfig";

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
//
// Tess, 2026-09-19: "refresh the instructions on the ssync how to use section
// based on the latest updates." Added the things that landed since: favourites
// (star + the ★ tab), merging duplicates, the Campaign Editorial / Lo-fi / BTS /
// Styling split, a board's seasonal colour palette, Build a deck, and Select /
// the Filter fold under "Everywhere". Kept the one-line-per-thing shape.

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const user = await getSessionUser();
  // Show the Product & Sourcing half only where it exists: a team member on a
  // full deploy. An ideation-only deploy (Tess, 2026-10-01) describes just the
  // Ideation sections, the same ones its nav shows.
  const isTeam = user?.role === "team" && !APP.ideationOnly;

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
          find it by search or the filters. <b>Star</b> the ones you love — the
          &#9733; Favorites tab shows just those — and merge duplicates into one.
        </li>
        <li>
          <b>Moodboard</b> — pull references onto boards, arranged into sections.
          Give a board the season&rsquo;s <b>colour palette</b>: edit a colour
          once and it changes everywhere that palette appears.
        </li>
        <li>
          <b>Campaign</b> — campaign and editorial inspiration, split into{" "}
          <b>Editorial</b>, <b>Lo-fi / BTS</b> and <b>Styling</b>. Cards lead
          with the photographer / DP; star, filter and merge the same as
          References.
        </li>
      </ul>

      {isTeam && (
        <>
          <h2>Product — making the styles</h2>
          <ul>
            <li>
              <b>Style Development</b> — styles in progress. <b>Build a deck</b>{" "}
              to gather a few into a fitting review.
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

          <h2>Sourcing — fabrics &amp; trims</h2>
          <ul>
            <li>
              <b>Materials</b> — the fabric, trim &amp; packaging library.
              Document each material once, with its supplier, spec and AI-file
              link, and reuse it.
            </li>
            <li>
              <b>Orders</b> — build a purchase order from the library. It groups
              by supplier, carries each material&rsquo;s full spec, and exports a
              clean PO to save or email.
            </li>
            <li>
              <b>Quotes</b> — the same, but asking a supplier to <i>price</i> the
              materials: no quantities, and you can hide or edit price and MOQ per
              line. To build one, open Quotes and add materials, or tick materials
              in the library and choose <b>Create quote</b>.
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
              In Detail, choose a <b>Page layout</b>, set the retail price and a
              description, and add or remove colours — click a colour chip to
              recolour it, or pick a swatch by hex and give it your own name.
            </li>
            <li>
              Add a <b>styled photo or croquis</b> right on the page — the
              crosshatched box is the drop zone (or Replace one that&rsquo;s
              there).
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
              image. Use <b>Review latest round</b> for the full-screen view.
            </li>
            <li>
              Comment to anyone on the team; export a style or a round to PDF.
            </li>
          </ul>
        </>
      )}

      <h2>Staying in the loop</h2>
      <ul>
        <li>
          The <b>bell</b> at the top shows new comments on styles you created or
          commented on. Open <b>Activity</b> to read them — the count clears when
          you do.
        </li>
        <li>
          <b>Email settings</b> (under your name) turn those emails on or off per
          person, and let you send yourself a test to check delivery.
        </li>
      </ul>

      <h2>Everywhere</h2>
      <ul>
        <li>
          Search, filter and sort sit at the top of each page; on a phone the
          filters fold behind <b>Filter</b>.
        </li>
        <li>The column icons resize the grid — more or fewer per row.</li>
        <li>
          <b>Select</b> turns a grid into a picker — edit, merge, delete or send
          several at once.
        </li>
        <li>
          Nothing is ever deleted. Trash holds it, and Restore brings it back.
        </li>
      </ul>
    </div>
  );
}
