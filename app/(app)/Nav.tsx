"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Brand } from "@/lib/brands";
import { APP } from "@/lib/appConfig";
import BrandSwitcher from "./BrandSwitcher";

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
      // The campaign credits, turned into a directory of photographers by city
      // (Tess, 2026-08-17) — a front door to "who has shot in this city".
      { href: "/photographers", label: "Photographers" },
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
      // Where finished / in-progress styles are assembled into a season or
      // evergreen linesheet (Tess, 2026-08-12).
      { href: "/linesheets", label: "Linesheets" },
    ],
  },
  // Sourcing is its own group as of the dropdown nav (Tess, 2026-08-19: "this
  // navigation is getting really long and wonky" → chose the dropdown layout).
  // The materials library and the orders drawn from it are sourcing, not
  // garment-making, so pulling them out of Product stops Product from being a
  // catch-all and gives each menu a clean, single subject. The group is
  // "Sourcing" rather than "Materials" so it doesn't collide with the library
  // page, which Tess renamed to "Materials" (2026-08-19: "yes rename to
  // materials") now that it holds fabrics, trims AND packaging.
  {
    label: "Sourcing",
    links: [
      // The fabric, trim & packaging library (Tess, 2026-08-18: "build library
      // for fabrics and trims"; 2026-08-19: "add packaging tab" + "rename to
      // materials").
      { href: "/materials", label: "Materials" },
      // Purchase orders assembled from that library (Tess, 2026-08-18: "add
      // ability to create an order for materials from the material library").
      { href: "/material-orders", label: "Material Orders" },
    ],
  },
];

export default function Nav({
  email,
  brand,
  brands,
  role,
}: {
  email: string;
  brand: string;
  brands: Brand[];
  role: "team" | "talent";
}) {
  const pathname = usePathname();
  // A talent sees only the ideation half of their brand (multi-brand phase 2):
  // no product group, no brand switcher, no Setup. The gate is enforced on the
  // server too — this only keeps a talent from being shown a door they cannot
  // open. The SSYNC wordmark takes them to References, not Development.
  const isTeam = role === "team";
  // The photographer directory and material ORDERS are FRED-only. The materials
  // library itself is NOT — SOUS SOUS and Renggli document their materials too
  // (Tess, 2026-08-19: "for renggli / sous sous — materials may be provided
  // directly from the factory — so you may not have to order separately … but we
  // do want option to document materials because many will be evergreen"). So the
  // library shows on every deploy; only ordering and the FRED-at-home
  // photographer work stay behind the FRED door. Route-level guards back this up.
  const FRED_ONLY = new Set(["/photographers", "/material-orders"]);
  const groups = (isTeam ? GROUPS : GROUPS.filter((g) => g.label === "Ideation"))
    .map((g) =>
      APP.id === "fred"
        ? g
        : { ...g, links: g.links.filter((l) => !FRED_ONLY.has(l.href)) },
    )
    // A group left with no links (all of them FRED-only on SSYNC) drops entirely
    // rather than rendering an empty menu. Sourcing survives on SSYNC because
    // Materials stays — only Material Orders is filtered out there.
    .filter((g) => g.links.length > 0);
  const home = isTeam ? "/development" : "/library";

  // Which group's links are showing inline on the team bar. It behaves like a row
  // of tabs (Tess, 2026-08-19: "the inline options should stay open until you
  // click product or sourcing"): exactly one group is open, its links sit inline,
  // and the ONLY thing that changes which is clicking another group. It does not
  // close when you click into the page, follow a link, or navigate — so the
  // options you opened stay put. It starts on the group holding the current page.
  const activeGroupLabel =
    groups.find((g) =>
      g.links.some((l) => pathname === l.href || pathname.startsWith(l.href + "/")),
    )?.label ??
    groups[0]?.label ??
    null;
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupLabel);

  // Below 1200px the full bar cannot hold six links plus the switcher, Setup,
  // the email and Sign out without clipping (Tess, 2026-08-11: "plan out how to
  // adjust design to be usable and clean across mobile and tablet"). So under
  // that width the whole thing collapses into a hamburger + slide-in drawer, and
  // the inline bar is CSS-hidden. One mobile pattern for tablet and phone alike.
  const [menuOpen, setMenuOpen] = useState(false);

  // The drawer closes when you arrive somewhere (a tapped link has done its job)
  // and on Escape, and the page underneath is scroll-locked while it is open so
  // a swipe moves the drawer's own list rather than the page behind it.
  // Only the mobile drawer closes on navigation; the inline group selection is
  // left exactly where the user put it (see the tabs note above).
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // The moodboard's floating Notes tab is a separate fixed element; mark the
    // body so CSS can pull it behind the open drawer (Tess, 2026-08-11: "notes
    // is still showing up on top of menu drawer (should be behind)").
    document.body.classList.add("nav-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.classList.remove("nav-open");
    };
  }, [menuOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="nav">
      <Link href={home} className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src={APP.logo} alt={APP.name} />
      </Link>
      {/* The team bar reads as a row of tabs: one group is selected, its links
          show inline, and clicking another group switches the selection (Tess,
          2026-08-19: "this navigation is getting really long and wonky" → dropdown
          layout; then "the inline options should stay open until you click
          product or sourcing"). The selected pill is filled rather than carrying
          a caret, which pointed down at options that actually open to the side
          (Tess: "the current carrot down is misleading ... rethink how to best
          symbolize"). A TALENT sees only Ideation — a few links, no length
          problem — so their bar stays the plain horizontal row (Tess: "for just
          the talent view ... stay as the horizontal bar"). Below the drawer
          breakpoint this row is hidden and the hamburger drawer takes over. */}
      <div className="nav-links">
        {isTeam
          ? groups.map((g) => {
              const open = openGroup === g.label;
              return (
                <div className={"nav-group" + (open ? " open" : "")} key={g.label}>
                  <button
                    type="button"
                    className="nav-group-trigger"
                    aria-expanded={open}
                    onClick={() => setOpenGroup(g.label)}
                  >
                    {g.label}
                  </button>
                  {open && (
                    <div className="nav-menu" role="group" aria-label={g.label}>
                      {g.links.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          className={"nav-menu-link" + (isActive(l.href) ? " active" : "")}
                        >
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          : groups
              .flatMap((g) => g.links)
              .map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={"nav-link" + (isActive(l.href) ? " active" : "")}
                >
                  {l.label}
                </Link>
              ))}
      </div>
      <div className="nav-right">
        {/* Which brand the team is looking at (multi-brand, Tess 2026-08-11).
            Everything on the page is scoped to it. A talent has no switcher —
            they see only their own brand (phase 2). */}
        {/* Only when there's actually a choice — a single-brand deployment
            (FRED) shows no switcher at all (Tess, 2026-08-17). */}
        {isTeam && brands.length > 1 && <BrandSwitcher active={brand} brands={brands} />}
        {/* + New Style used to sit here (Tess, 2026-08-06: "dont have new style
            in upper navigation -- it's confusing"). It was the only ACTION in a
            row of destinations — everything else in this bar takes you
            somewhere, and that one made a record. It still lives at the top of
            /development, beside the count of what is already there, which is
            where you are standing when you decide to add one. Nothing was
            removed: /styles/new is unchanged and still reachable directly. */}
        {/* Setup moved to the footer (Tess, 2026-08-11: "move set-up to bottom
            footer"). It was never a destination like the others — it is the
            go-live checklist — so it reads better as a quiet footer link than as
            a tab-height item in the top bar. Team only, there and here. */}
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

      {/* Hamburger — CSS-shown only below the drawer breakpoint. */}
      <button
        type="button"
        className="nav-burger"
        aria-label="Menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>

      {menuOpen && (
        <>
          <div className="nav-scrim" onClick={() => setMenuOpen(false)} />
          <div className="nav-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="nav-drawer-head">
              <span className="brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="brand-logo" src={APP.logo} alt={APP.name} />
              </span>
              <button
                type="button"
                className="nav-drawer-close"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                &times;
              </button>
            </div>
            {/* Primary nav — the destinations, grouped Ideation / Product.
                Reworked so the tiny captions read as headers and the Title-Case
                rows read as the tappable things (Tess, 2026-08-11: "mobile drawer
                menu is confusing" -> "rework it more fully"). */}
            <nav className="nav-drawer-nav">
              {groups.map((g) => (
                <div className="nav-drawer-group" key={g.label}>
                  <div className="nav-drawer-label">{g.label}</div>
                  {g.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={"nav-drawer-link" + (isActive(l.href) ? " active" : "")}
                      onClick={() => setMenuOpen(false)}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>

            {/* Settings & account, set apart from the destinations by a rule:
                which brand you are looking at, then the personal links. */}
            <div className="nav-drawer-foot">
              {isTeam && brands.length > 1 && (
                <div className="nav-drawer-brand">
                  <span className="nav-drawer-label">Brand</span>
                  <BrandSwitcher active={brand} brands={brands} />
                </div>
              )}
              <div className="nav-drawer-account">
                {/* Setup moved to the footer (Tess, 2026-08-11) — the footer
                    shows on every page at both widths, so it is still reachable
                    on a phone without also sitting in the drawer. */}
                <Link
                  href="/notifications"
                  className={"nav-drawer-sub" + (isActive("/notifications") ? " active" : "")}
                  onClick={() => setMenuOpen(false)}
                >
                  Notification settings
                </Link>
                <div className="nav-drawer-who">{email}</div>
                <form action="/auth/signout" method="post">
                  <button className="btn ghost sm" type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
