"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refThumb, type Reference } from "@/lib/types";
import { APP } from "@/lib/appConfig";
import { PEOPLE, creditFor, isInstagram, type PeopleKind } from "@/lib/people";
import { downscaleImage } from "@/app/components/downscaleImage";
import SizeToggle from "@/app/components/SizeToggle";
import {
  buildDirectoryFromPeople,
  groupByGeo,
  type PeopleProfile,
} from "@/lib/photographers";
import { type PersonRecord } from "@/lib/peopleRecords";
import { cityGeo } from "@/lib/geo";
import {
  readCard,
  tierLabel,
  EMPTY_META,
  type PhotographerMeta,
  type PhotographerTier,
} from "@/lib/photographerMeta";
import {
  setPhotographerMeta,
  updatePerson,
  addPhotographerImages,
  removePhotographerImage,
  saveImagesToCampaign,
  addPerson,
  removePerson,
} from "@/app/actions/photographers";
import MultiSelect from "@/app/components/MultiSelect";
import DetailModal from "../library/DetailModal";

// The bare domain of a URL for display, while the link still carries the whole
// thing (Tess, 2026-08-17: "just shows ... main url -- but links to the full
// url"). "https://www.mollymatalon.com/about" reads as "mollymatalon.com".
function prettyHost(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

// The stored `ig` is a full instagram URL, not a handle. Pull the handle out so
// the card reads "@paulbellaart", not "@https://www.instagram.com/paulbellaart/"
// (Tess, 2026-08-17: "just show ig handle ... way too jumbled").
function igHandle(ig: string): string {
  const m = ig.match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : ig).replace(/^@/, "").replace(/\/+$/, "").trim();
}

// The deck's sections, then the models' two groups, in the order they read in the
// deck (Tess, 2026-11-02). A group nobody has typed before sorts after these,
// alphabetically, so a new one is never lost — it just has no fixed place yet.
const GROUP_ORDER = [
  "Movement",
  "Portrait & studio",
  "Documentary & atmosphere",
  "Behind the scenes",
  "Directors",
  "Shortlist",
  "Casting reference",
];
function sortGroups(gs: string[]): string[] {
  const pos = (g: string) => {
    const i = GROUP_ORDER.indexOf(g);
    return i < 0 ? GROUP_ORDER.length : i;
  };
  return [...gs].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
}

// Photographers, browsed by city (Tess, 2026-08-17: "easy to get to a list of
// people / profiles in different cities ... look at their work"). A profile also
// shows the team-entered side — group, role, medium, past work, notes.
//
// Since people phase 1 (2026-11-02) each person is a record (db/p30): filed once,
// in the city they are based in, keyed by id, with their pictures being every
// image tagged to them. Only the team edits.
const cardsOf = (people: PersonRecord[]) =>
  Object.fromEntries(people.map((p) => [p.id, readCard(p.card)])) as Record<string, PhotographerMeta>;

export default function PhotographersClient({
  refs,
  people: records,
  links,
  canEdit = false,
  kind = "photographer",
}: {
  refs: Reference[];
  people: PersonRecord[];
  links: { reference_id: string; person_id: string }[];
  canEdit?: boolean;
  /** Which directory this is — the same page serves Photographers and Models
   *  (Tess, 2026-11-02). See lib/people.ts. */
  kind?: PeopleKind;
}) {
  const people = PEOPLE[kind];
  const isModel = kind === "model";
  const [q, setQ] = useState("");
  // Grid (image cards by place) vs List (a flat, dense name list) — Tess,
  // 2026-08-18: "offer a list view for photographers as well".
  const [view, setView] = useState<"grid" | "list">("grid");
  // Grid density — the S/M/L control every grid now carries (design pass 2026-09-15).
  const [size, setSize] = useState("md");
  const [tierFilter, setTierFilter] = useState<"" | PhotographerTier>("");
  // The deck's sections as a filter (Tess, 2026-11-02). "" is all.
  const [groupFilter, setGroupFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [, startStar] = useTransition();
  // Geographic filters — multi-select (Tess, 2026-08-17: "select multiple cities,
  // countries"). Each narrows the next: chosen continents limit the country
  // options, chosen countries limit the cities. Empty at a level means "all".
  const [continentF, setContinentF] = useState<string[]>([]);
  const [countryF, setCountryF] = useState<string[]>([]);
  const [cityF, setCityF] = useState<string[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Reference | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, PhotographerMeta>>(() => cardsOf(records));
  // Take the server's cards again after a refresh — an add or a remove changes
  // them, and the optimistic star has already been saved by then.
  useEffect(() => setMeta(cardsOf(records)), [records]);
  const personById = useMemo(() => new Map(records.map((p) => [p.id, p])), [records]);

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  const byId = useMemo(() => {
    const m = new Map<string, Reference>();
    for (const r of refs) m.set(r.id, r);
    return m;
  }, [refs]);

  // creditFor reads a row as this directory sees it — on a model's row the
  // Instagram is the model's, not the photo credit's — for the fallbacks
  // (handle, cities shot in, brands) a record does not carry itself.
  const { cities, photographers } = useMemo(
    () =>
      buildDirectoryFromPeople(
        records.map((p) => ({ id: p.id, name: p.name, city: p.city, ig: p.ig })),
        links,
        refs.map((r) => creditFor(kind, r))
      ),
    [records, links, refs, kind]
  );

  const profileByKey = useMemo(() => {
    const m = new Map<string, PeopleProfile>();
    for (const p of photographers) m.set(p.key, p);
    return m;
  }, [photographers]);

  // Each city's place, resolved once.
  const cityPlace = (city: string, located: boolean) =>
    located ? cityGeo(city) : { continent: "Unspecified", country: "" };

  // Every city with its place, resolved once — shared by the dropdown options and
  // the pruning the multi-selects do when a higher level changes.
  const geoRows = useMemo(
    () => cities.map((c) => ({ city: c.city, located: c.located, ...cityPlace(c.city, c.located) })),
    [cities]
  );

  // The values available to the geo dropdowns, cascading: countries within the
  // chosen continents, cities within the chosen countries/continents.
  const geoOptions = useMemo(() => {
    const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean))).sort((x, y) => x.localeCompare(y));
    const inCont = continentF.length ? geoRows.filter((r) => continentF.includes(r.continent)) : geoRows;
    const inCountry = countryF.length ? inCont.filter((r) => countryF.includes(r.country)) : inCont;
    return {
      continents: uniq(geoRows.map((r) => r.continent)),
      countries: uniq(inCont.map((r) => r.country)),
      cities: uniq(inCountry.filter((r) => r.located).map((r) => r.city)),
    };
  }, [geoRows, continentF, countryF]);

  // When a higher level changes, drop any lower selections it no longer allows,
  // so a stale pick can't silently empty the page.
  const chooseContinents = (vals: string[]) => {
    setContinentF(vals);
    const okC = new Set(geoRows.filter((r) => !vals.length || vals.includes(r.continent)).map((r) => r.country));
    const okCity = new Set(geoRows.filter((r) => !vals.length || vals.includes(r.continent)).map((r) => r.city));
    setCountryF((prev) => prev.filter((c) => okC.has(c)));
    setCityF((prev) => prev.filter((c) => okCity.has(c)));
  };
  const chooseCountries = (vals: string[]) => {
    setCountryF(vals);
    const okCity = new Set(geoRows.filter((r) => !vals.length || vals.includes(r.country)).map((r) => r.city));
    setCityF((prev) => prev.filter((c) => okCity.has(c)));
  };

  // Search matches a photographer's name, their city or country, or a brand they
  // have worked with (the images' designers plus their past-work note). The tier
  // and geo filters narrow further; per-city counts are recomputed so a filtered
  // city reads honestly.
  const term = q.trim().toLowerCase();
  const shownCities = useMemo(() => {
    return cities
      .filter((c) => {
        const { continent, country } = cityPlace(c.city, c.located);
        if (continentF.length && !continentF.includes(continent)) return false;
        if (countryF.length && !countryF.includes(country)) return false;
        if (cityF.length && !cityF.includes(c.city)) return false;
        return true;
      })
      .map((c) => {
        const { country } = cityPlace(c.city, c.located);
        const people = c.photographers.filter((p) => {
          if (tierFilter && (meta[p.key]?.tier ?? null) !== tierFilter) return false;
          if (groupFilter && (meta[p.key]?.group ?? "") !== groupFilter) return false;
          if (starredOnly && !meta[p.key]?.starred) return false;
          if (!term) return true;
          if (c.city.toLowerCase().includes(term)) return true;
          if (country.toLowerCase().includes(term)) return true;
          if (p.name.toLowerCase().includes(term)) return true;
          const m = meta[p.key];
          const brands = [
            ...(profileByKey.get(p.key)?.shotFor ?? []),
            m?.pastWork ?? "",
            m?.agency ?? "",
            m?.group ?? "",
            m?.role ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return brands.includes(term);
        });
        if (!people.length) return null;
        const count = people.reduce((n, p) => n + p.ids.length, 0);
        return { ...c, photographers: people, count };
      })
      .filter(Boolean) as typeof cities;
  }, [cities, term, tierFilter, groupFilter, starredOnly, continentF, countryF, cityF, meta, profileByKey]);

  // Nest the filtered cities into continent -> country -> city.
  const continents = useMemo(() => groupByGeo(shownCities, cityGeo), [shownCities]);


  // Counts reflect what's shown, so the header tracks the active filter.
  const shownPeople = useMemo(() => {
    const s = new Set<string>();
    for (const c of shownCities) for (const p of c.photographers) s.add(p.key);
    return s.size;
  }, [shownCities]);
  const locatedCities = shownCities.filter((c) => c.located).length;
  // Only offer the tier filter once someone actually has a tier set — and only
  // where the at-home / campaign tiers mean something (the product extras).
  const hasTiers = useMemo(
    () => APP.productExtras && photographers.some((p) => meta[p.key]?.tier),
    [photographers, meta]
  );
  // The groups actually in use, in the deck's order.
  const groups = useMemo(
    () =>
      sortGroups(
        Array.from(new Set(photographers.map((p) => meta[p.key]?.group ?? "").filter(Boolean)))
      ),
    [photographers, meta]
  );
  const hasStarred = useMemo(
    () => photographers.some((p) => meta[p.key]?.starred),
    [photographers, meta]
  );

  // Star / unstar from the thumbnail. Optimistic — the meta updates locally at
  // once, and the save follows.
  function toggleStar(key: string) {
    const next = { ...(meta[key] ?? EMPTY_META), starred: !meta[key]?.starred };
    setMeta((m) => ({ ...m, [key]: next }));
    startStar(async () => {
      await setPhotographerMeta(key, { starred: next.starred }, kind);
    });
  }
  const openProfile = openKey ? profileByKey.get(openKey) ?? null : null;
  const metaFor = (key: string) => meta[key] ?? EMPTY_META;

  const igUrl = (ig: string | null) => {
    if (!ig) return null;
    if (/^https?:\/\//i.test(ig)) return ig; // already a full URL — use it as-is
    const h = igHandle(ig);
    return h ? `https://instagram.com/${h}` : null;
  };
  const igLabel = (ig: string) => "@" + igHandle(ig);

  // A roster prospect often has no image of their own yet — the card falls back
  // to their initials, and the IG/site link on it is one click to their work.
  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  // The image thumbs behind a photographer (a roster entry carries none), in the
  // team's hand-set order — so the FIRST image in the profile is also the card's
  // thumbnail (Tess, 2026-08-17: "whatever the first image is in the order of
  // profile should be the thumbnail"). Unordered ones keep their default place.
  const workSrcs = (key: string, ids: string[]) => {
    // One picture can reach a person through two rows (Chris Colls's FRAME image
    // is his own row and the photo credit on Alexandra Agoston's), so the count
    // and cover go by picture, as the profile grid does.
    const seen = new Set<string>();
    const withImg = ids
      .map((id) => {
        const r = byId.get(id);
        const src = r ? refThumb(r) : "";
        if (!src || seen.has(src)) return null;
        seen.add(src);
        return { id, src };
      })
      .filter(Boolean) as { id: string; src: string }[];
    const order = meta[key]?.imageOrder ?? [];
    if (order.length) {
      const pos = new Map(order.map((id, i) => [id, i] as const));
      withImg.sort(
        (a, b) => (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
    }
    return withImg.map((x) => x.src);
  };

  // Their website or agency page: the record's, else the first a picture of
  // theirs carries. A model's Instagram also rides in a row's link, and is
  // already their handle, so it is not offered again as a site.
  const siteOf = (key: string, ids: string[]) =>
    personById.get(key)?.link ||
    ids.map((id) => byId.get(id)?.link).find((l) => !!l && !(isModel && isInstagram(l))) ||
    null;

  // One photographer card, reused across every city grid.
  function card(p: { key: string; name: string; ig: string | null; ids: string[] }) {
    const srcs = workSrcs(p.key, p.ids);
    // A card in a city where this person has no picture of their own — a deck
    // photographer filed at their base, whose work in SSYNC was shot elsewhere —
    // borrows the cover from the rest of their work rather than showing initials
    // (2026-11-02). The count still reflects what is in this city.
    const allIds = profileByKey.get(p.key)?.ids ?? p.ids;
    const src = srcs[0] ?? workSrcs(p.key, allIds)[0] ?? null;
    // The handle line: the IG handle, or — for a site-only photographer — the
    // bare domain of their website. A model card reads age · agency instead,
    // which is what casting is looked at for.
    const site = siteOf(p.key, p.ids);
    const m = meta[p.key];
    const handle = isModel
      ? [m?.age, m?.agency].filter(Boolean).join(" · ") || (p.ig ? igLabel(p.ig) : null)
      : p.ig ? igLabel(p.ig) : site ? prettyHost(site) : null;
    const starred = !!meta[p.key]?.starred;
    return (
      <div className="pg-card" key={p.key}>
        <button
          type="button"
          className="pg-card-open"
          onClick={() => setOpenKey(p.key)}
          title={`See ${p.name}'s work`}
        >
          <div className={"pg-card-img" + (src ? "" : " empty")}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={p.name} loading="lazy" />
            ) : (
              <span className="pg-card-initials">{initials(p.name)}</span>
            )}
            {srcs.length > 1 && <span className="pg-card-count">{srcs.length}</span>}
          </div>
          <div className="pg-card-name">{p.name}</div>
          {handle && <div className="pg-card-ig">{handle}</div>}
        </button>
        {/* Star in the corner of the thumbnail — a team flag (Tess, 2026-08-17).
            A talent sees a filled star only if it's already set. */}
        {canEdit ? (
          <button
            type="button"
            className={"pg-star" + (starred ? " on" : "")}
            aria-pressed={starred}
            title={starred ? "Unstar" : "Star"}
            onClick={() => toggleStar(p.key)}
          >
            ★
          </button>
        ) : starred ? (
          <span className="pg-star on" aria-hidden="true">★</span>
        ) : null}
      </div>
    );
  }

  // One photographer as a dense list row — same data as the card, grouped under
  // the same city (Tess, 2026-08-18: "the list view should be organized the same
  // way as the grid view").
  function listRow(p: { key: string; name: string; ig: string | null; ids: string[] }) {
    const tier = meta[p.key]?.tier ?? null;
    const site = siteOf(p.key, p.ids);
    const linkUrl = igUrl(p.ig) || site;
    const linkLabel = p.ig ? igLabel(p.ig) : site ? prettyHost(site) : null;
    const starred = !!meta[p.key]?.starred;
    const n = workSrcs(p.key, p.ids).length;
    return (
      <div className="pg-lrow" key={p.key}>
        {canEdit ? (
          <button
            type="button"
            className={"pg-lstar" + (starred ? " on" : "")}
            title={starred ? "Unstar" : "Star"}
            onClick={() => toggleStar(p.key)}
          >
            ★
          </button>
        ) : (
          <span className={"pg-lstar" + (starred ? " on" : " sp")}>{starred ? "★" : ""}</span>
        )}
        <button type="button" className="pg-lname" onClick={() => setOpenKey(p.key)}>
          {p.name}
        </button>
        {APP.productExtras && tier && <span className={"pg-tier pg-tier-" + tier}>{tierLabel(tier)}</span>}
        {meta[p.key]?.group && <span className="pg-cap">{meta[p.key]?.group}</span>}
        <span className="pg-lspace" />
        {n > 0 && <span className="pg-lcount">{n} {n === 1 ? "image" : "images"}</span>}
        {linkUrl && linkLabel && (
          <a className="pg-llink" href={linkUrl} target="_blank" rel="noreferrer">{linkLabel}</a>
        )}
      </div>
    );
  }

  return (
    <div className="page lib-page pg-page">
      <div className="page-head">
        <h1 className="page-title display">{people.title}</h1>
        <div className="spacer" />
        {shownPeople > 0 && (
          <span className="pg-count">
            {shownPeople} {shownPeople === 1 ? people.noun : people.nouns} · {locatedCities}{" "}
            {locatedCities === 1 ? "city" : "cities"}
          </span>
        )}
        {/* Add someone by hand (Tess, 2026-11-02: "a space for potential models
            to be added"). Team only, like every other edit here. */}
        {canEdit && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Add
          </button>
        )}
        {/* The shared grid/list view toggle (design pass 2026-09-15: one such
            control, not a per-page duplicate — was its own pg-vt classes). */}
        <div className="mat-viewtoggle" role="group" aria-label="View">
          <button
            type="button"
            className={"mat-vt" + (view === "grid" ? " on" : "")}
            aria-pressed={view === "grid"}
            title="Grid view"
            onClick={() => setView("grid")}
          >
            ▦
          </button>
          <button
            type="button"
            className={"mat-vt" + (view === "list" ? " on" : "")}
            aria-pressed={view === "list"}
            title="List view"
            onClick={() => setView("list")}
          >
            ☰
          </button>
        </div>
        {/* Grid density — same S/M/L control as the other grids (design pass
            2026-09-15). Grid view only. */}
        {view === "grid" && <SizeToggle value={size} onChange={setSize} />}
      </div>

      <div className="lib-bar">
        <input
          className="input lib-search"
          placeholder={
            isModel
              ? "Search a model, city, agency, or a brand they've worked with…"
              : "Search a photographer, city, country, or a brand they've worked with…"
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {(hasTiers || hasStarred || groups.length > 0) && (
        <div className="pg-filters">
          {groups.length > 0 &&
            ["", ...groups].map((g) => (
              <button
                key={g || "all-groups"}
                type="button"
                className={"pg-filter" + (groupFilter === g ? " on" : "")}
                aria-pressed={groupFilter === g}
                onClick={() => setGroupFilter(g)}
              >
                {g || "All"}
              </button>
            ))}
          {hasTiers &&
            ([["", "All"], ["home", "At home"], ["campaign", "Campaign"]] as [
              "" | PhotographerTier,
              string,
            ][]).map(([val, label]) => (
              <button
                key={val || "all"}
                type="button"
                className={"pg-filter" + (tierFilter === val ? " on" : "")}
                aria-pressed={tierFilter === val}
                onClick={() => setTierFilter(val)}
              >
                {label}
              </button>
            ))}
          {hasStarred && (
            <button
              type="button"
              className={"pg-filter pg-filter-star" + (starredOnly ? " on" : "")}
              aria-pressed={starredOnly}
              onClick={() => setStarredOnly((v) => !v)}
            >
              ★ Starred
            </button>
          )}
        </div>
      )}

      {geoOptions.continents.length > 0 && (
        <div className="pg-geo-filters">
          <MultiSelect
            className="select"
            aria-label="Continents"
            placeholder="All continents"
            allLabel="continents"
            values={continentF}
            onChange={chooseContinents}
            options={geoOptions.continents.map((v) => ({ value: v, label: v }))}
          />
          <MultiSelect
            className="select"
            aria-label="Countries"
            placeholder="All countries"
            allLabel="countries"
            values={countryF}
            onChange={chooseCountries}
            options={geoOptions.countries.map((v) => ({ value: v, label: v }))}
          />
          <MultiSelect
            className="select"
            aria-label="Cities"
            placeholder="All cities"
            allLabel="cities"
            values={cityF}
            onChange={setCityF}
            options={geoOptions.cities.map((v) => ({ value: v, label: v }))}
          />
          {(continentF.length > 0 || countryF.length > 0 || cityF.length > 0) && (
            <button
              type="button"
              className="btn link"
              onClick={() => { setContinentF([]); setCountryF([]); setCityF([]); }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {shownCities.length === 0 ? (
        <div className="empty">
          {records.length === 0
            ? isModel
              ? "No models yet. Use “+ Add” to start the casting list."
              : "No photographers yet — use “+ Add”."
            : `No ${people.nouns} match those filters.`}
        </div>
      ) : (
        continents.map((cont) => (
          <section className="pg-continent" key={cont.continent}>
            <h2 className={"pg-continent-name" + (cont.continent === "Unspecified" ? " muted" : "")}>
              {cont.continent}
            </h2>
            {cont.countries.map((country) => (
              <div className="pg-country" key={country.country || "_none"}>
                {country.country && <h3 className="pg-country-name">{country.country}</h3>}
                {country.cities.map((c) => (
                  <section className="pg-city" key={c.city}>
                    <div className="pg-city-head">
                      <h4 className={"pg-city-name" + (c.located ? "" : " muted")}>{c.city}</h4>
                      <span className="pg-city-meta">
                        {c.photographers.length}{" "}
                        {c.photographers.length === 1 ? people.noun : people.nouns}
                      </span>
                    </div>
                    {view === "list" ? (
                      <div className="pg-list">{c.photographers.map((p) => listRow(p))}</div>
                    ) : (
                      <div className={"pg-grid dens-" + size}>{c.photographers.map((p) => card(p))}</div>
                    )}
                  </section>
                ))}
              </div>
            ))}
          </section>
        ))
      )}

      {openProfile && (
        <ProfileModal
          kind={kind}
          profile={openProfile}
          person={personById.get(openProfile.key) ?? null}
          site={siteOf(openProfile.key, openProfile.ids)}
          meta={metaFor(openProfile.key)}
          groups={groups}
          canEdit={canEdit}
          byId={byId}
          onImage={(r) => setDetail(r)}
          onClose={() => setOpenKey(null)}
          onSaved={(m) => { setMeta((prev) => ({ ...prev, [openProfile.key]: m })); flashToast("Saved"); }}
          onRemoved={() => { setOpenKey(null); flashToast("Moved to Trash"); }}
          onMerged={(into) => { setOpenKey(into); flashToast("Merged"); }}
          onToast={flashToast}
          igUrl={igUrl}
          igLabel={igLabel}
        />
      )}

      {detail && (
        <DetailModal
          r={detail}
          actions="editorial"
          onClose={() => setDetail(null)}
          onToast={flashToast}
          onDeleted={() => { setDetail(null); flashToast("Moved to Trash"); }}
        />
      )}

      {adding && (
        <AddPersonModal
          kind={kind}
          groups={groups}
          onClose={() => setAdding(false)}
          onAdded={(name) => { setAdding(false); flashToast(`Added ${name}`); }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// A photographer's profile — their whole body of work with a way into each
// image, the derived "shot for" list, and the team-entered card (tier, video,
// directs, clients) with an inline editor for the team.
function ProfileModal({
  kind,
  profile,
  person,
  site,
  meta,
  groups,
  canEdit,
  byId,
  onImage,
  onClose,
  onSaved,
  onRemoved,
  onMerged,
  onToast,
  igUrl,
  igLabel,
}: {
  kind: PeopleKind;
  profile: PeopleProfile;
  person: PersonRecord | null;
  site: string | null;
  meta: PhotographerMeta;
  groups: string[];
  canEdit: boolean;
  byId: Map<string, Reference>;
  onImage: (r: Reference) => void;
  onClose: () => void;
  onSaved: (m: PhotographerMeta) => void;
  onRemoved: () => void;
  onMerged: (intoId: string) => void;
  onToast: (m: string) => void;
  igUrl: (ig: string | null) => string | null;
  igLabel: (ig: string) => string;
}) {
  const isModel = kind === "model";
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Two-click Remove (the project's arm pattern — never a confirm()).
  const [removeArm, setRemoveArm] = useState(false);
  const [draft, setDraft] = useState<PhotographerMeta>(meta);
  // Who they are — on the record itself, not the card (people phase 1). A name
  // that matches someone else's merges the two on save.
  const whoOf = () => ({
    name: person?.name ?? profile.name,
    city: person?.city ?? "",
    ig: person?.ig ?? profile.ig ?? "",
    link: person?.link ?? site ?? "",
  });
  const [who, setWho] = useState(whoOf);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const imgInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function save() {
    setErr(null);
    start(async () => {
      const before = whoOf();
      const changed =
        who.name.trim() !== before.name ||
        who.city.trim() !== before.city ||
        who.ig.trim() !== before.ig ||
        who.link.trim() !== before.link;
      await setPhotographerMeta(profile.key, draft, kind);
      if (changed) {
        const res = await updatePerson(profile.key, who, kind);
        if (!res.ok) {
          setErr(res.error ?? "Couldn't save.");
          return;
        }
        setEditing(false);
        router.refresh();
        if (res.mergedInto) {
          onMerged(res.mergedInto);
          return;
        }
      } else setEditing(false);
      onSaved(draft);
    });
  }

  // Take this person out of the directory: their own rows go to Trash (a
  // photographer's Campaign images stay where they are). See removePerson.
  function remove() {
    start(async () => {
      await removePerson(kind, profile.key);
      router.refresh();
      onRemoved();
    });
  }

  const ig = igUrl(profile.ig);
  // The image a row points at, used to tell a roster image from its Campaign copy
  // (they share it) and to de-dupe the two into one tile.
  const imgKey = (r: Reference) =>
    (r.image_url as string | null) ||
    (r.image as string | null) ||
    refThumb(r) ||
    r.id;
  // Only the refs that actually carry an image are "work"; a roster entry has
  // none. Then de-dupe (Tess, 2026-08-19: "is there a way it doesn't have to show
  // twice ... if we add to campaign"): saving an image to Campaign makes an
  // 'editorial' copy pointing at the same picture, so the profile drops that copy
  // in favour of the roster original — the tile shows once, and the copy is what
  // lives in /editorial.
  const workRefsRaw = useMemo(() => {
    const all = profile.ids
      .map((id) => byId.get(id))
      .filter((r): r is Reference => !!r && !!refThumb(r));
    const rosterKeys = new Set(all.filter((r) => r.type === "roster").map(imgKey));
    const seen = new Set<string>();
    const out: Reference[] = [];
    for (const r of all) {
      const k = imgKey(r);
      if (r.type !== "roster" && rosterKeys.has(k)) continue; // the campaign copy of a roster image
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.ids, byId]);
  // Which displayed images are already in the Campaign library — for the badge.
  const campaignKeys = useMemo(() => {
    const s = new Set<string>();
    for (const id of profile.ids) {
      const r = byId.get(id);
      if (r && r.type === "editorial") s.add(imgKey(r));
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.ids, byId]);
  // Apply the team's hand-set order; anything not in the list keeps its default
  // place at the end, so a fresh upload shows up without disturbing the order.
  const workRefs = useMemo(() => {
    if (!meta.imageOrder.length) return workRefsRaw;
    const pos = new Map(meta.imageOrder.map((id, i) => [id, i] as const));
    return [...workRefsRaw].sort(
      (a, b) =>
        (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [workRefsRaw, meta.imageOrder]);

  // Drag-to-reorder the grid (Tess, 2026-08-17: "easy reorder of images ... by
  // dragging"). Local order for a smooth drag; the id list is saved on drop and
  // rides back through the photographer's meta.
  const [items, setItems] = useState<Reference[]>(workRefs);
  const itemsRef = useRef<Reference[]>(workRefs);
  const dragId = useRef<string | null>(null);
  useEffect(() => {
    setItems(workRefs);
    itemsRef.current = workRefs;
  }, [workRefs]);

  function reorderTo(targetId: string) {
    const src = dragId.current;
    if (!src || src === targetId) return;
    setItems((cur) => {
      const from = cur.findIndex((x) => x.id === src);
      const to = cur.findIndex((x) => x.id === targetId);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      itemsRef.current = next;
      return next;
    });
  }
  function commitOrder() {
    dragId.current = null;
    if (!canEdit) return;
    const ids = itemsRef.current.map((x) => x.id);
    start(async () => {
      await setPhotographerMeta(profile.key, { imageOrder: ids }, kind);
      onSaved({ ...meta, imageOrder: ids });
    });
  }
  // Remove one image from the profile — optimistic, then a soft delete (it goes
  // to Trash, recoverable). Tess, 2026-08-17: "allow to x out image easily".
  function removeImg(id: string) {
    if (!canEdit) return;
    setItems((cur) => {
      const next = cur.filter((x) => x.id !== id);
      itemsRef.current = next;
      return next;
    });
    onToast("Image removed");
    start(async () => {
      await removePhotographerImage(id, kind);
      router.refresh();
    });
  }
  // Save-to-Campaign select mode (Tess, 2026-08-19: "from the photographer
  // profile, you can specifically select images you want saved into the campaign
  // library"). Off, a click opens the image; on, a click ticks it.
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
  function leavePick() {
    setPicking(false);
    setPicked(new Set());
  }
  function saveToCampaign() {
    const ids = Array.from(picked);
    if (ids.length === 0) return;
    leavePick();
    onToast(`Saved ${ids.length} to Campaign`);
    start(async () => {
      await saveImagesToCampaign(ids);
      router.refresh();
    });
  }

  // Upload the shots the team picks. Each becomes a roster row under this
  // photographer's name; a refresh pulls them straight back into the grid.
  async function addImages(list: FileList | null) {
    if (!canEdit) return;
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    // Shrink first, as the Add form does — the upload action's body is capped at
    // ~4.5 MB on Vercel and a phone photo is often bigger.
    for (const f of files) fd.append("files", await downscaleImage(f));
    try {
      const res = await addPhotographerImages(profile.key, fd, kind);
      if (res.ok) {
        router.refresh();
        onToast(res.added === 1 ? "Added 1 image" : `Added ${res.added} images`);
      }
      if (res.errors.length) onToast(res.errors[0]);
    } catch {
      onToast("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div
        className="modal pg-profile"
        onDragOver={canEdit ? (e) => e.preventDefault() : undefined}
        onDrop={
          canEdit
            ? (e) => { e.preventDefault(); addImages(e.dataTransfer.files); }
            : undefined
        }
      >
        {/* Name and links share the header line (Tess, 2026-08-17: "put links
            next to name"). */}
        <div className="modal-head pg-head">
          <div className="pg-head-main">
            <span className="pg-head-name">{profile.name}</span>
            {ig && (
              <a className="pg-profile-ig" href={ig} target="_blank" rel="noreferrer">
                {igLabel(profile.ig!)}
              </a>
            )}
            {site && (
              <a className="pg-profile-ig" href={site} target="_blank" rel="noreferrer">
                {prettyHost(site)}
              </a>
            )}
          </div>
          {/* Edit sits at the right of the header, just left of the close
              (Tess, 2026-08-17). */}
          <div className="pg-head-actions">
            {canEdit && !editing && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => { setDraft(meta); setWho(whoOf()); setErr(null); setEditing(true); }}
              >
                Edit profile
              </button>
            )}
            <button className="notes-close" onClick={onClose} title="Close">×</button>
          </div>
        </div>

        <div className="modal-body">
          {/* One consistent labelled column for every fact — tier, medium, cities,
              past work, notes — instead of the old row of filled/outline tag boxes
              that read as toggle states (Tess, 2026-08-17). Image count dropped. */}
          {APP.productExtras && meta.tier && !editing && (
            <div className="pg-facts">
              <span className="k">Tier</span>
              <div className="pg-fact-val">{tierLabel(meta.tier)}</div>
            </div>
          )}
          {meta.group && !editing && (
            <div className="pg-facts">
              <span className="k">Group</span>
              <div className="pg-fact-val">{meta.group}</div>
            </div>
          )}
          {meta.role && !editing && (
            <div className="pg-facts">
              <span className="k">Role</span>
              <div className="pg-fact-val">{meta.role}</div>
            </div>
          )}
          {meta.age && !editing && (
            <div className="pg-facts">
              <span className="k">Age</span>
              <div className="pg-fact-val">{meta.age}</div>
            </div>
          )}
          {meta.agency && !editing && (
            <div className="pg-facts">
              <span className="k">Agency</span>
              <div className="pg-fact-val">{meta.agency}</div>
            </div>
          )}
          {!isModel && (meta.photo || meta.video) && !editing && (
            <div className="pg-facts">
              <span className="k">Medium</span>
              <div className="pg-fact-val">
                {[meta.photo && "Photo", meta.video && "Video"].filter(Boolean).join(" · ")}
              </div>
            </div>
          )}
          {profile.based && !editing && (
            <div className="pg-facts">
              <span className="k">Based</span>
              <div className="pg-fact-val">{profile.based}</div>
            </div>
          )}
          {/* The cities on their pictures, apart from where they live — kept
              from when a photographer was listed in every one (people phase 1). */}
          {profile.shotIn.length > 0 && !editing && (
            <div className="pg-facts">
              <span className="k">Shot in</span>
              <div className="pg-fact-val">{profile.shotIn.join(", ")}</div>
            </div>
          )}
          {meta.pastWork.trim() && !editing && (
            <div className="pg-facts">
              <span className="k">{isModel ? "Work" : "Past work"}</span>
              <div className="pg-fact-val">{meta.pastWork}</div>
            </div>
          )}
          {meta.notes.trim() && !editing && (
            <div className="pg-facts">
              <span className="k">Notes</span>
              <div className="pg-fact-val pg-fact-notes">{meta.notes}</div>
            </div>
          )}

          {/* Team editor for the card. Opened from the "Edit profile" button in
              the header; a talent never sees it. */}
          {canEdit && editing && (
            <div className="pg-editor">
              <div className="pg-editor-row">
                <label className="pg-editor-label">Name</label>
                <input
                  className="input"
                  value={who.name}
                  onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))}
                />
              </div>
              <div className="pg-editor-row">
                <label className="pg-editor-label">Based in</label>
                <input
                  className="input"
                  placeholder="New York"
                  value={who.city}
                  onChange={(e) => setWho((w) => ({ ...w, city: e.target.value }))}
                />
              </div>
              <div className="pg-editor-row">
                <label className="pg-editor-label">Instagram</label>
                <input
                  className="input"
                  placeholder="@handle"
                  value={who.ig}
                  onChange={(e) => setWho((w) => ({ ...w, ig: e.target.value }))}
                />
              </div>
              <div className="pg-editor-row">
                <label className="pg-editor-label">{isModel ? "Agency page" : "Website"}</label>
                <input
                  className="input"
                  value={who.link}
                  onChange={(e) => setWho((w) => ({ ...w, link: e.target.value }))}
                />
              </div>
              <div className="pg-editor-row">
                <label className="pg-editor-label">Group</label>
                <input
                  className="input"
                  list="pg-groups"
                  placeholder={isModel ? "Shortlist, Casting reference…" : "Movement, Portrait & studio…"}
                  value={draft.group}
                  onChange={(e) => setDraft((d) => ({ ...d, group: e.target.value }))}
                />
                <datalist id="pg-groups">
                  {groups.map((g) => <option key={g} value={g} />)}
                </datalist>
              </div>
              {isModel ? (
                <>
                  <div className="pg-editor-row">
                    <label className="pg-editor-label">Age</label>
                    <input
                      className="input"
                      value={draft.age}
                      onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))}
                    />
                  </div>
                  <div className="pg-editor-row">
                    <label className="pg-editor-label">Agency</label>
                    <input
                      className="input"
                      value={draft.agency}
                      onChange={(e) => setDraft((d) => ({ ...d, agency: e.target.value }))}
                    />
                  </div>
                </>
              ) : (
                <div className="pg-editor-row">
                  <label className="pg-editor-label">Role</label>
                  <input
                    className="input"
                    placeholder="Photographer, Director of photography…"
                    value={draft.role}
                    onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  />
                </div>
              )}
              {APP.productExtras && (
              <div className="pg-editor-row">
                <label className="pg-editor-label">Tier</label>
                <div className="pg-seg">
                  {([["home", "At home"], ["campaign", "Campaign"]] as [PhotographerTier, string][]).map(
                    ([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        className={"pg-seg-btn" + (draft.tier === val ? " on" : "")}
                        onClick={() => setDraft((d) => ({ ...d, tier: d.tier === val ? null : val }))}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>
              )}
              {!isModel && (
              <div className="pg-editor-row">
                <label className="pg-editor-label">Medium</label>
                <div className="pg-seg">
                  <button
                    type="button"
                    className={"pg-seg-btn" + (draft.photo ? " on" : "")}
                    onClick={() => setDraft((d) => ({ ...d, photo: !d.photo }))}
                  >
                    Photo
                  </button>
                  <button
                    type="button"
                    className={"pg-seg-btn" + (draft.video ? " on" : "")}
                    onClick={() => setDraft((d) => ({ ...d, video: !d.video }))}
                  >
                    Video
                  </button>
                </div>
              </div>
              )}
              <div className="pg-editor-row">
                <label className="pg-editor-label">{isModel ? "Work" : "Past work"}</label>
                <textarea
                  className="textarea"
                  rows={2}
                  placeholder="Brands, agencies, notable jobs…"
                  value={draft.pastWork}
                  onChange={(e) => setDraft((d) => ({ ...d, pastWork: e.target.value }))}
                />
              </div>
              <div className="pg-editor-row">
                <label className="pg-editor-label">Notes</label>
                <textarea
                  className="textarea"
                  rows={2}
                  placeholder="Anything else — rate, contact, availability, a reminder…"
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
              {err && <div className="up-err">{err}</div>}
              <div className="pg-editor-tools">
                <button type="button" className="btn sm" disabled={pending} onClick={save}>
                  {pending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="ph-link" disabled={pending} onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <span className="spacer" />
                {/* Remove from the directory — two clicks, disarms when the
                    pointer leaves. Rows go to Trash, recoverable. */}
                <button
                  type="button"
                  className={"btn link danger" + (removeArm ? " arm" : "")}
                  disabled={pending}
                  onMouseLeave={() => setRemoveArm(false)}
                  onClick={() => (removeArm ? remove() : setRemoveArm(true))}
                >
                  {removeArm ? `Remove ${profile.name}?` : "Remove"}
                </button>
              </div>
            </div>
          )}

          {/* Image toolbar: a bit of guidance on the left, "Add images" on the
              right (Tess, 2026-08-17). The whole modal is also a drop zone. */}
          {canEdit && (
            <div className="pg-imgbar">
              <input
                ref={imgInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { addImages(e.target.files); e.currentTarget.value = ""; }}
              />
              <button
                type="button"
                className="btn ghost sm"
                disabled={uploading}
                onClick={() => imgInput.current?.click()}
              >
                {uploading
                  ? "Uploading…"
                  : workRefs.length || !APP.productExtras
                    ? "+ Add images"
                    : "+ Add at-home images"}
              </button>
              {/* Save selected images into the Campaign library (Tess,
                  2026-08-19). Only meaningful once there are images. */}
              {!isModel && workRefs.length > 0 && (
                <button
                  type="button"
                  className={"btn ghost sm" + (picking ? " on" : "")}
                  onClick={() => (picking ? leavePick() : setPicking(true))}
                >
                  {picking ? "Cancel" : "Save to Campaign"}
                </button>
              )}
              <span className="pg-imgbar-hint">
                {picking
                  ? "Tap the images to save into the Campaign library"
                  : workRefs.length > 1
                    ? "Drag to reorder — the first image is the thumbnail"
                    : workRefs.length === 0
                      ? APP.productExtras
                        ? "Add the 3–5 shots that feel most at home — or drag them in"
                        : "Add a few pictures — or drag them in"
                      : ""}
              </span>
            </div>
          )}
          {workRefs.length > 0 ? (
            <div className="grid dens-md pg-profile-grid">
              {items.map((r) => {
                const src = refThumb(r);
                const isPicked = picked.has(r.id);
                const draggable = canEdit && !picking;
                return (
                  <div
                    className={
                      "card lib-card" +
                      (draggable ? " pg-drag" : "") +
                      (picking ? " mat-selectable" : "") +
                      (isPicked ? " mat-selected" : "")
                    }
                    key={r.id}
                    onClick={() => (picking ? togglePick(r.id) : onImage(r))}
                    draggable={draggable}
                    onDragStart={draggable ? () => { dragId.current = r.id; } : undefined}
                    onDragOver={draggable ? (e) => { e.preventDefault(); reorderTo(r.id); } : undefined}
                    onDrop={draggable ? (e) => { e.preventDefault(); commitOrder(); } : undefined}
                    onDragEnd={draggable ? commitOrder : undefined}
                  >
                    <div className="imgwrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src ?? ""} alt={r.designer || ""} loading="lazy" draggable={false} />
                      {picking && <span className="mat-check">{isPicked ? "✓" : ""}</span>}
                      {!picking && campaignKeys.has(imgKey(r)) && (
                        <span className="pg-incampaign" title="Saved to the Campaign library">
                          In campaign
                        </span>
                      )}
                      {canEdit && !picking && (
                        <button
                          type="button"
                          className="pg-img-x"
                          title="Remove image"
                          aria-label="Remove image"
                          onClick={(e) => { e.stopPropagation(); removeImg(r.id); }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="meta">
                      <div className="s">
                        {[r.designer, r.location, r.year && r.year !== "Unknown" ? r.year : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // A roster prospect with no images yet — point at where the work is.
            <div className="pg-nowork">
              No images saved yet. See their work
              {ig && <> on <a href={ig} target="_blank" rel="noreferrer">Instagram</a></>}
              {site && <> · <a href={site} target="_blank" rel="noreferrer">their site</a></>}
              {canEdit && (APP.productExtras
                ? <>, then add the at-home ones with the button above.</>
                : <>, then add a few with the button above.</>)}
            </div>
          )}

          {picking && picked.size > 0 && (
            <div className="mo-pickbar">
              <span className="mo-pickbar-n">{picked.size} selected</span>
              <div className="spacer" />
              <button type="button" className="btn" onClick={saveToCampaign}>
                Save to Campaign
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add someone by hand (Tess, 2026-11-02: "create a space for potential models to
// be added as well"). Name is the only thing required; everything else can be
// filled in later from their profile. Photos are optional — without one the card
// shows initials until a picture is added.
function AddPersonModal({
  kind,
  groups,
  onClose,
  onAdded,
}: {
  kind: PeopleKind;
  groups: string[];
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const isModel = kind === "model";
  const people = PEOPLE[kind];
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    name: "",
    location: "",
    ig: "",
    link: "",
    group: "",
    role: "",
    age: "",
    agency: "",
    pastWork: "",
    notes: "",
  });
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((cur) => ({ ...cur, [k]: e.target.value }));

  function addFiles(list: FileList | null) {
    const imgs = Array.from(list ?? []).filter((x) => x.type.startsWith("image/"));
    setFiles((cur) => [...cur, ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }
  useEffect(() => () => files.forEach((x) => URL.revokeObjectURL(x.url)), [files]);

  function submit() {
    if (!f.name.trim()) {
      setErr("Add a name first.");
      return;
    }
    setErr(null);
    start(async () => {
      const fd = new FormData();
      for (const x of files) fd.append("files", await downscaleImage(x.file));
      const res = await addPerson(kind, { ...f, photo: !isModel ? true : undefined }, fd);
      if (!res.ok) {
        setErr(res.errors[0] || "Couldn't add.");
        return;
      }
      router.refresh();
      onAdded(f.name.trim());
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-up">
        <div className="modal-head">
          <span>Add {people.noun}</span>
          <button className="notes-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body up-body">
          <div
            className={"up-drop" + (drag ? " over" : "")}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }}
            />
            {files.length === 0 ? (
              <span>Drop photos here, or click to choose. Optional.</span>
            ) : (
              <div className="up-thumbs">
                {files.map((x, i) => (
                  <div className="up-thumb" key={x.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.url} alt="" />
                    <button
                      className="up-x"
                      title="Remove"
                      onClick={(e) => { e.stopPropagation(); setFiles((cur) => cur.filter((_, j) => j !== i)); }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="up-fields">
            <div className="field up-full">
              <label>Name</label>
              <input className="input" value={f.name} onChange={set("name")} autoFocus />
            </div>
            <div className="field">
              <label>{isModel ? "Based in" : "City"}</label>
              <input className="input" placeholder="New York" value={f.location} onChange={set("location")} />
            </div>
            <div className="field">
              <label>Group</label>
              <input
                className="input"
                list="pg-add-groups"
                placeholder={isModel ? "Shortlist" : "Movement"}
                value={f.group}
                onChange={set("group")}
              />
              <datalist id="pg-add-groups">
                {groups.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div className="field">
              <label>Instagram</label>
              <input className="input" placeholder="@handle" value={f.ig} onChange={set("ig")} />
            </div>
            <div className="field">
              <label>{isModel ? "Agency page" : "Website"}</label>
              <input className="input" value={f.link} onChange={set("link")} />
            </div>
            {isModel ? (
              <>
                <div className="field">
                  <label>Age</label>
                  <input className="input" value={f.age} onChange={set("age")} />
                </div>
                <div className="field">
                  <label>Agency</label>
                  <input className="input" value={f.agency} onChange={set("agency")} />
                </div>
              </>
            ) : (
              <div className="field up-full">
                <label>Role</label>
                <input
                  className="input"
                  placeholder="Photographer, Director of photography…"
                  value={f.role}
                  onChange={set("role")}
                />
              </div>
            )}
            <div className="field up-full">
              <label>{isModel ? "Work" : "Past work"}</label>
              <textarea className="textarea" rows={2} value={f.pastWork} onChange={set("pastWork")} />
            </div>
            <div className="field up-full">
              <label>Notes</label>
              <textarea className="textarea" rows={3} value={f.notes} onChange={set("notes")} />
            </div>
          </div>

          {err && <div className="up-err">{err}</div>}
        </div>
        <div className="up-foot">
          <button className="btn link" disabled={pending} onClick={onClose}>Cancel</button>
          <button className="btn sm" disabled={pending} onClick={submit}>
            {pending ? "Adding…" : `Add ${people.noun}`}
          </button>
        </div>
      </div>
    </div>
  );
}
