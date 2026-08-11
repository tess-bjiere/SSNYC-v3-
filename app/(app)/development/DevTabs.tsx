"use client";

import Select from "@/app/components/Select";
import SizeToggle from "@/app/components/SizeToggle";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  styleStatusLabel,
  sampleRatingLabel,
  sampleStatusShort,
  isApprovedStatus,
  SAMPLE_RATINGS,
  type Style,
} from "@/lib/types";
import {
  DEV_SORTS,
  DEFAULT_DEV_SORT,
  sortStyles,
  type DevSummary,
} from "@/lib/devSort";
import {
  NO_FILTERS,
  anyFilter,
  facetOptions,
  findStyles,
  resultLabel,
  type StyleFilters,
} from "@/lib/styleFilter";
import { styleCoverUrl } from "@/lib/styleCover";

// The Development tabs.
//
// Four of them are the status pipeline — a style is in exactly one. The fifth,
// Evergreen, cuts across it: an evergreen style is a block the studio keeps
// remaking, and it can be sitting in production, archived, or anywhere else at
// the same time. So the tab filters on the flag, not the status, and the status
// badge stays on the card to say where each one currently is (P3 #43).
//
// The refinement added two things on top of that (P3 refinements):
//
//   an order you choose
//       The grid was ordered by updated_at and nothing else, which answers only
//       "what did somebody touch?". The four orders in lib/devSort.ts are the
//       four questions people actually arrive with. Nothing is ever filtered
//       out by a sort — a grid that silently drops rows is how work goes
//       missing — so "Needs attention" puts the calm styles at the bottom
//       rather than hiding them.
//
//   a round and an ETA on the thumbnail
//       The line Xander and the C-level read without opening anything: which
//       round this style is on, and when the sample lands. Both come from the
//       same summary the sort reads, so the card and the order cannot disagree.
//
// SEARCH AND FILTERS (Tess, 2026-08-05: "you should be able to sort and filter
// with logical options" and "add search functionality to styles").
//
// Sorting rearranges; searching and filtering HIDE. That is a real difference
// and this file is careful about it, because the rule stated above — nothing is
// dropped quietly — still holds. Three things keep it honest:
//
//   Every hidden row was hidden by something a person typed or chose. There is
//   no default filter and no clever "probably not relevant" pass.
//
//   Whatever is in force stays on screen while it is in force, next to a Clear
//   that puts everything back in one click.
//
//   The count line says both numbers — "3 of 41 styles" — so the size of what is
//   being hidden is never a thing you have to work out.
//
// The filter options are built from the styles that exist, not from a fixed
// list, so there is never an option that returns nothing. See lib/styleFilter.ts.
//
// SEARCH CUTS ACROSS THE TABS, on purpose. Somebody typing "anorak" is looking
// for the anorak, and does not necessarily know whether it was archived last
// week. Searching inside the current tab would answer "no" to a question whose
// true answer is "yes, in Archived". So while there is a query, the tab strip
// reports how many matches sit in each tab and the grid says where they are.
// "evergreen" and "seasonal" are not statuses — they are the two halves of the
// evergreen flag, and the Style Library is organised by them rather than by
// stage. "all" is the Library's default: what has been made, in one grid.
export type TabKey = Style["status"] | "evergreen" | "seasonal" | "all";

// Inspo was the first tab (Tess, 2026-08-06: "remove inspo from development").
// It named the stage before this tool starts — an idea with no style number is a
// reference, and references have their own half of the app. See lib/types.ts.
const DEFAULT_TABS: { key: TabKey; label: string }[] = [
  // Tess, 2026-08-06: "in development tab, call development Sampling in the
  // menu next to production". The KEY stays "development" — it is the stored
  // styles.status value and renaming it would need a migration and would break
  // every row already written. Only the word a person reads changes, and it
  // changes to the truer one: this tab is where styles sit while samples are
  // going back and forth with the factory.
  { key: "development", label: "Sampling" },
  { key: "production", label: "Production" },
  { key: "archived", label: "Archived" },
  { key: "evergreen", label: "Evergreen" },
];

const TAB_STATUSES: readonly string[] = ["development", "production", "archived"];

function inTab(s: Style, tab: TabKey): boolean {
  if (tab === "all") return true;
  if (tab === "seasonal") return !s.evergreen;
  if (tab === "evergreen") return s.evergreen;
  // A status no tab claims — "inspo" on a row written before it was retired, or
  // anything typed straight into the database — is shown under Development
  // rather than dropped. A style must never be invisible in every tab.
  if (tab === "development" && !TAB_STATUSES.includes(s.status)) return true;
  return s.status === tab;
}

function StatusBadge({ s }: { s: Style["status"] }) {
  const cls = s === "development" ? "dev" : s === "production" ? "prod" : s;
  return <span className={"badge " + cls}>{s === "development" ? "In development" : styleStatusLabel(s)}</span>;
}

// The Style Library renders this same component with a different tab strip
// (2026-08-06). Deliberately not a copy: the card, the search, the facets, the
// sort and the counts are the studio's grid, and a second implementation of it
// would drift the first time one of them was improved. Everything below is
// unchanged for Development, which passes no tabs at all.
export default function DevTabs({
  styles,
  summaries,
  tabs = DEFAULT_TABS,
  initialTab = "development",
  note,
}: {
  styles: Style[];
  summaries: Record<string, DevSummary>;
  tabs?: { key: TabKey; label: string }[];
  initialTab?: TabKey;
  /** A line above the grid, shown on every tab. Used by the Style Library. */
  note?: React.ReactNode;
}) {
  const TABS = tabs;
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [sort, setSort] = useState<string>(DEFAULT_DEV_SORT);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<StyleFilters>(NO_FILTERS);
  // Status is a filter, not a sort (Tess, 2026-08-11): "" is any; the two values
  // read the same DevSummary the cards and the old sorts read.
  const [status, setStatus] = useState("");
  // Thumbnail size / column count, the same control the other grids use (Tess,
  // 2026-08-11: "development view on mobile should allow you to toggle between
  // multi column views for the style thumbnails"). 4 / 2 / 1 columns on a phone.
  const [size, setSize] = useState("md");
  // Multi-select for the fitting deck (Tess, 2026-08-10: "select multiple
  // products to include into a recent beautiful fitting deck"). Off by default,
  // so the grid stays a grid of links; turning it on makes a card a checkbox
  // instead of a link, and a floating bar carries the chosen ids to the deck.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopPicking() {
    setPicking(false);
    setPicked(new Set());
  }

  // Each style carried alongside its current-round rating, so the grid can
  // filter by the same traffic light the card shows (Tess, 2026-08-09). The
  // rating is not a stored column on a style — it is the verdict on the round
  // the style is on — so it is folded in here from the summary rather than read
  // off the row. Everything downstream works on these augmented rows; they are a
  // superset of Style, so the card, the tab test and the sort are unchanged.
  const rows = useMemo(
    () => styles.map((s) => ({ ...s, rating: summaries[s.id]?.rating ?? "" })),
    [styles, summaries]
  );

  // Search and filters apply to every style before the tab does, so the tab
  // counts below report matches rather than totals — otherwise a tab would
  // promise eleven styles and then show two.
  const matching = useMemo(() => {
    const base = findStyles(rows, query, filters);
    if (!status) return base;
    // Status reads the summary, which findStyles cannot see, so it is applied
    // here — before the tab counts, so a status filter narrows them too.
    return base.filter((s) => {
      const sum = summaries[s.id];
      if (!sum) return false;
      return status === "attention" ? sum.attention > 0 : sum.readyForFitting;
    });
  }, [rows, query, filters, status, summaries]);

  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, matching.filter((s) => inTab(s, t.key)).length])
  ) as Record<TabKey, number>;

  // The options are the values that actually exist across the whole set — not
  // the filtered set, which would make a filter remove its own way back.
  const seasons = useMemo(() => facetOptions(rows, "season"), [rows]);
  const factories = useMemo(() => facetOptions(rows, "factory"), [rows]);
  const categories = useMemo(() => facetOptions(rows, "category"), [rows]);
  const brands = useMemo(() => facetOptions(rows, "brand"), [rows]);
  // Rating reads as a scale, not a tally, so it is ordered good → workable →
  // poor rather than commonest-first like the others.
  const ratings = useMemo(() => {
    const rank = (v: string) => {
      const i = (SAMPLE_RATINGS as readonly string[]).indexOf(v);
      return i === -1 ? SAMPLE_RATINGS.length : i;
    };
    return facetOptions(rows, "rating").sort((a, b) => rank(a.value) - rank(b.value));
  }, [rows]);

  const map = new Map(Object.entries(summaries));
  const shown = sortStyles(matching.filter((s) => inTab(s, tab)), map, sort);
  const sortHint = DEV_SORTS.find((s) => s.id === sort)?.hint ?? "";

  const narrowed = anyFilter(filters, query) || Boolean(status);
  const inThisTab = rows.filter((s) => inTab(s, tab)).length;
  // Matches sitting in the other tabs — the answer to "it is not here, is it
  // anywhere?", which is the question a search is usually really asking.
  const elsewhere = matching.length - shown.length;

  function set(field: keyof StyleFilters, value: string) {
    setFilters((f) => ({ ...f, [field]: value }));
  }

  function clearAll() {
    setQuery("");
    setFilters(NO_FILTERS);
    setStatus("");
  }

  function facetSelect(
    field: keyof StyleFilters,
    label: string,
    options: { value: string; count: number }[],
    // The fewest options worth showing the control for. Two by default — a
    // select that can only say "any" or the single value it has narrows nothing,
    // and hiding it is what keeps the bar from filling with dead controls
    // (Tess, 2026-08-09). Season passes 1: it is a primary planning axis Tess
    // wants listed even before a second season exists (Tess, 2026-08-09: "list
    // season instead of designer").
    minOptions = 2,
    // How the stored value reads in the menu. Rating is stored lowercase and
    // shows title-cased; everything else shows exactly as it is on the row.
    format: (v: string) => string = (v) => v
  ) {
    if (options.length < minOptions) return null;
    return (
      <Select
        className={"select sm" + (filters[field] ? " on" : "")}
        value={filters[field]}
        aria-label={label}
        onChange={(v) => set(field, v)}
        options={[
          // "Any" rather than a blank line: an unset filter is no opinion, and
          // it should read as one.
          { value: "", label: `${label}: any` },
          // No count beside the value. The facet is drawn from every style, not
          // the current tab, so a rating can exist in Archived while the tab
          // showing the menu is Sampling — and "Poor (1)" then read as "one poor
          // sample here" when there were none (Tess, 2026-08-09: "it's saying
          // there's 1 poor in sampling but that is actually in archived… remove
          // the numbers next to the filter options"). The cross-tab count line
          // and the "N more in the other tabs" note still say where things are;
          // the per-option number only ever misled inside a tab.
          ...options.map((o) => ({ value: o.value, label: format(o.value) })),
        ]}
      />
    );
  }

  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={"tab" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="n">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="sortbar">
        {/* Search gets its own line and the full width — it is the control
            people reach for before they know which tab the thing is in, and
            crowding it against the selects was what made the bar feel tight
            (Tess, 2026-08-09: "layout is cramped/awkward"). */}
        <input
          className="input sm findbox"
          type="search"
          value={query}
          placeholder="Search styles — name, number, fabric, color, factory…"
          aria-label="Search styles"
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Sort and the filters share the second line. The sort control needs no
            "Sort" label (Tess, 2026-08-09) — it reads "Recent updates",
            "A–Z" and so on, which already say what it does; the word above it
            was furniture. */}
        <div className="sortbar-row">
          <Select
            id="devsort"
            className="select sm"
            aria-label="Sort order"
            value={sort}
            onChange={setSort}
            options={DEV_SORTS.map((s) => ({ value: s.id, label: s.label }))}
          />

          {/* Status filters to a SET rather than reordering everything (Tess,
              2026-08-11: "these should act more as filter not sort"). It reads
              the same DevSummary the cards do, so the two cannot disagree. */}
          <Select
            className={"select sm" + (status ? " on" : "")}
            aria-label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "Status: any" },
              { value: "attention", label: "Needs attention" },
              { value: "fitting", label: "Ready for fitting" },
            ]}
          />

          <SizeToggle value={size} onChange={setSize} />

          {/* Season leads and always lists (min 1). Designer is deliberately
              not here — Tess, 2026-08-09: "list season instead of designer". The
              field still exists in the filter engine, it just has no control on
              this bar. Brand self-hides until a second brand exists. */}
          {facetSelect("season", "Season", seasons, 1)}
          {facetSelect("factory", "Factory", factories)}
          {facetSelect("category", "Category", categories)}
          {facetSelect("brand", "Brand", brands)}
          {facetSelect("rating", "Rating", ratings, 2, sampleRatingLabel)}

          {/* Only when something is actually in force, so it is never a button
              that does nothing. */}
          {narrowed && (
            <button type="button" className="btn link" onClick={clearAll}>
              Clear
            </button>
          )}

          {/* Turn the grid into a picker to build a fitting deck. The label
              says what it is for (Tess, 2026-08-11: "Select should be changed to
              something like 'select styles for fitting deck'"); on shows "Done"
              beside the count in the floating bar. */}
          <button
            type="button"
            className={"btn link" + (picking ? " on" : "")}
            onClick={() => (picking ? stopPicking() : setPicking(true))}
          >
            {picking ? "Done" : "Select for fitting deck"}
          </button>

          {/* Both numbers, always, so nothing is hidden quietly. */}
          <span className="h">{narrowed ? resultLabel(inThisTab, shown.length) : sortHint}</span>
        </div>
      </div>

      {/* The other half of the answer when a search finds nothing here: it may
          well have found something in Archived. */}
      {narrowed && elsewhere > 0 && (
        <div className="tab-note">
          {elsewhere} more match{elsewhere === 1 ? "" : "es"} in the other tabs — the counts above say
          where.
        </div>
      )}

      {note && <div className="tab-note">{note}</div>}

      {tab === "evergreen" && shown.length > 0 && (
        <div className="tab-note">
          Blocks the studio remakes. Open one and choose <strong>Repurpose</strong> to copy it into
          a new season — the fit history comes with it, the sample rounds start clean.
        </div>
      )}

      {shown.length === 0 && narrowed ? (
        <div className="empty">
          {elsewhere > 0 ? (
            <>
              Nothing matches in {TABS.find((t) => t.key === tab)?.label}, but {elsewhere} style
              {elsewhere === 1 ? "" : "s"} elsewhere do. Try another tab, or{" "}
              <button type="button" className="linkish" onClick={clearAll}>
                clear the search
              </button>
              .
            </>
          ) : (
            <>
              Nothing matches. Try fewer words, or{" "}
              <button type="button" className="linkish" onClick={clearAll}>
                clear the search
              </button>
              .
            </>
          )}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          {tab === "evergreen" ? (
            <>
              No evergreen styles yet. Tick <strong>Evergreen</strong> on a style you expect to
              remake and it will collect here.
            </>
          ) : (
            <>No styles in {TABS.find((t) => t.key === tab)?.label}. Create one with “+ New Style”.</>
          )}
        </div>
      ) : (
        <div className={"grid dens-" + size}>
          {shown.map((s) => {
            const sum = summaries[s.id] ?? null;
            const roundLabel = sum?.roundLabel ?? "";
            // A date on the line only when a sample is still out — the ETA/overdue
            // badge over the picture already carries that. Once the sample is in,
            // the line reads the fitting status instead of the day it arrived
            // (Tess, 2026-08-10). See sampleStatusShort.
            const statusShort = sum && sum.etaState === "landed" ? sampleStatusShort(sum.status) : "";
            const approved = sum?.etaState === "landed" && isApprovedStatus(sum.status);
            const thumb = styleCoverUrl(s);
            const isPicked = picked.has(s.id);
            return (
              <Link
                className={"card" + (picking ? " picking" : "") + (isPicked ? " picked" : "")}
                key={s.id}
                href={`/styles/${s.id}`}
                // In pick mode a card is a checkbox, not a link: swallow the
                // navigation and toggle instead, so choosing styles for the deck
                // never opens one by accident.
                onClick={picking ? (e) => { e.preventDefault(); togglePick(s.id); } : undefined}
              >
                {picking && (
                  <span className={"card-check" + (isPicked ? " on" : "")} aria-hidden="true">
                    {isPicked ? "✓" : ""}
                  </span>
                )}
                <div className="imgwrap">
                  {/* The style's own face — sketch, then lay flat, then model
                      shot, then the inherited cover image. Two styles developed
                      from the same library reference used to be identical in
                      this grid. See lib/styleCover.ts. */}
                  {thumb ? <img src={thumb} alt={s.name} loading="lazy" /> : null}
                  {/* The one thing worth saying over the picture. Late beats
                      everything else; otherwise it is the promised date. */}
                  {sum && sum.etaState !== "none" && sum.etaState !== "landed" && (
                    <span className={"card-eta " + sum.etaState}>{sum.etaLabel}</span>
                  )}
                </div>
                <div className="meta">
                  <div className="d">{s.name}</div>
                  <div className="s">
                    {[s.style_no, s.garment].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {/* The factory on its own line (Tess, 2026-08-05: "factory
                      should be listed small on thumbnial"). It was third in the
                      run-on above, where it read as another attribute of the
                      garment; it is the answer to a different question — who is
                      making this — and it is the one people scan the grid for
                      when a factory is running late. Small and quiet, because
                      the style is still the subject of the card. */}
                  {s.factory && <div className="card-factory">{s.factory}</div>}

                  {/* Round and ETA, in the order they are asked about: what is
                      it on, and when does it land — led by a dot for how that
                      round came out (Tess, 2026-08-06: "have rating (green,
                      yellow, red) of most recent sample on thumbnail").

                      The round name says how far along a style is and says
                      nothing about whether what arrived was any good, which is
                      the difference between a 3rd proto because the first two
                      were poor and a 3rd proto because the studio kept adding
                      colourways. The same three colours, and the same dot, as
                      the "Also sampled with" pills — one mark meaning
                      one thing everywhere it appears, so it needs no key.

                      Unrated draws nothing. Not a grey dot: any mark on a card
                      is read as a judgement, and "nobody has looked yet" is not
                      one. The title carries the word, because a colour on its
                      own is not readable to everyone. */}
                  {(roundLabel || statusShort) && (
                    <div className="card-round">
                      {sum?.rating && (
                        <span
                          className={"sib-dot " + sum.rating}
                          title={`Came back ${sum.rating}`}
                          aria-label={`Latest round rated ${sum.rating}`}
                        />
                      )}
                      {/* One text run so the "·" spaces normally inside the
                          inline-flex row; only the status is coloured. Approved
                          reads green — the one "done" state, worth spotting
                          across the grid (Tess, 2026-08-10). */}
                      <span>
                        {roundLabel}
                        {roundLabel && statusShort ? " · " : ""}
                        {statusShort && (
                          <span className={approved ? "card-status-ok" : undefined}>{statusShort}</span>
                        )}
                      </span>
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/* The status badge only when the tab does not already say it
                        (Tess, 2026-08-10: "remove in development bc that's
                        already implied if it's in the sampling folder"). Inside
                        the Sampling / Production / Archived tabs every card
                        carries that status, so the badge is noise; on Evergreen,
                        the Style Library and the cross-cutting views status
                        varies, so it stays. A style filed under a tab whose key
                        it does not match — a stray status shown under Sampling —
                        still shows its real badge, because there it is news. */}
                    {s.status !== tab && <StatusBadge s={s.status} />}
                    {s.evergreen && <span className="badge ever">Evergreen</span>}
                    {tab === "evergreen" && s.season && <span className="badge">{s.season}</span>}
                    {sum?.readyForFitting && <span className="badge fit">Ready for fitting</span>}
                    {/* Only the reasons the round line does not already give. */}
                    {sum && sum.attention > 0 && sum.etaState !== "late" && !sum.readyForFitting && sum.attentionLabel && (
                      <span className="badge warn">{sum.attentionLabel}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* The floating picker bar — only while choosing and only once something is
          chosen, so it is never an empty toolbar. It carries the picked ids to
          the deck in the order they sit in the grid. */}
      {picking && picked.size > 0 && (
        <div className="pickbar no-print">
          <span className="pickbar-count">
            {picked.size} selected
          </span>
          <Link
            className="btn sm"
            href={`/fitting-deck?ids=${shown.filter((s) => picked.has(s.id)).map((s) => s.id).join(",")}`}
          >
            Fitting deck
          </Link>
          <button type="button" className="btn link" onClick={stopPicking}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
