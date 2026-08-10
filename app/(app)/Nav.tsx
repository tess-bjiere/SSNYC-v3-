"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The top row, in two named halves.
//
// Tess, 2026-08-06: "rethinnk navigation / organization: product (development /
// factories) references / mood board / campaign — im not set on that i just
// want it to be very clear / logical in that somethings are actual development
// and somethings are ideation".
//
// The requirement is the second sentence, not the first, so the shape below is
// the smallest thing that satisfies it: the same five tabs, at the same five
// URLs, with a hairline and a caption telling you which half of the studio each
// one belongs to. Nothing moved, nothing was renamed, nobody's bookmark broke —
// what changed is that the row no longer reads as five equal siblings when two
// of them are about garments that exist and three are about pictures of
// garments that do not.
//
// PRODUCT is the work with a factory on the other end of it: styles in
// development, and the factories making them.
//
// IDEATION is everything upstream of that: references pulled, boards built from
// them, campaign. It is deliberately the wider group — that is the honest
// shape of the tool.
//
// Tess, 2026-08-06: "i like the thought of how the navigation is organized --
// but it looks messy with it stacked". The organisation stays; the stacking
// goes. The captions now sit ON the same line as their links rather than above
// them, so the bar is one row of text again instead of two ragged columns.
// Nothing about the grouping changed — only its height.
//
// Tess, 2026-08-06: "change editorial to campaign on nav and page" — so the
// last tab now carries the word from her own draft. The URL is still
// /editorial, exactly as /library stayed /library through its own rename: a tab
// label is what the studio calls a page, the path is where every link anybody
// has already sent still points. Moving a tab between groups, or renaming one,
// is a one-line edit here.
const GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: "Ideation",
    links: [
      // Sample Images used to sit in this row (Tess, 2026-08-06: "remove sample
      // images from navigation"). Once every round grew its own photography
      // section on the style profile, the standalone page stopped being where
      // the work happens — pictures are filed against the round they arrived
      // with, and a top-level tab listing them across every style was a second,
      // weaker route to the same images.
      //
      // The PAGE IS NOT DELETED, only unlinked — /photography still builds,
      // still renders, and every #photography anchor on a profile plus any link
      // anybody has already sent still works. Putting the tab back is one line.
      //
      // References, and ahead of Moodboard (Tess, 2026-08-06: "change library to
      // references and move before moodboard"). "Library" named the container;
      // "References" names what is in it, which is the word the studio already
      // uses out loud for a picture pulled to point at. And it comes first
      // because it is the earlier act: you gather references, then you board
      // them.
      //
      // The URL stays /library, exactly as /photography did through its own
      // rename. A tab label is what the studio calls a page; the path is where
      // every link anybody has already sent still points.
      { href: "/library", label: "References" },
      { href: "/moodboard", label: "Moodboard" },
      { href: "/editorial", label: "Campaign" },
    ],
  },
  // Tess, 2026-08-06: "ideation should come before product." Ideation leads now
  // because it is the earlier act — you gather and board before anything gets
  // made — so the bar reads left to right in the order the work happens.
  {
    label: "Product",
    links: [
      { href: "/development", label: "Development" },
      // Tess, 2026-08-06: "in navigation, factories should be 'styles by
      // factory'". The page is not a directory of factories — it is the work,
      // grouped by who is doing it — and the old word sent people looking for
      // addresses and contacts. Label only: the route stays /factories so every
      // link, bookmark and share already sent out still lands.
      { href: "/factories", label: "Styles by Factory" },
      // Tess, 2026-08-06: "add style library to the product section this is
      // where completed styles live -- they can be seasonal or evergreen and
      // can be easily re-purposed for future collections", then "style library
      // should come after it" — after Styles by Factory. So the group now reads
      // in the order the work runs: what is being made, who is making it, and
      // what came out the other end and was kept.
      { href: "/style-library", label: "Style Library" },
    ],
  },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <Link href="/development" className="brand">
        SSYNC
      </Link>
      <div className="nav-links">
        {GROUPS.map((g) => (
          <Fragment key={g.label}>
            {/* A hairline used to sit between the groups (Tess, 2026-08-06:
                "remove divider"). The gap does the same work quietly. */}
            <div className="nav-group">
              {/* Presentational: the accessible grouping is the heading text
                  itself, read out before the links it labels. */}
              <span className="nav-grouplabel">{g.label}</span>
              <div className="nav-grouplinks">
                {g.links.map((l) => {
                  const active = pathname === l.href || pathname.startsWith(l.href + "/");
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={"nav-link" + (active ? " active" : "")}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      <div className="nav-right">
        {/* + New Style used to sit here (Tess, 2026-08-06: "dont have new style
            in upper navigation -- it's confusing"). It was the only ACTION in a
            row of destinations — everything else in this bar takes you
            somewhere, and that one made a record. It still lives at the top of
            /development, beside the count of what is already there, which is
            where you are standing when you decide to add one. Nothing was
            removed: /styles/new is unchanged and still reachable directly. */}
        {/* Setup is not a feature, so it does not get a tab — but it needs to be
            reachable without remembering a URL, because the things on it are the
            things standing between this and the team using it. */}
        <Link href="/setup" className="nav-link" title="Go-live checklist">
          Setup
        </Link>
        {/* Personal settings hang off your own name rather than taking a tab. */}
        <Link href="/notifications" className="who" title="Notification settings">
          {email}
        </Link>
        <form action="/auth/signout" method="post">
          <button className="btn ghost sm" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
