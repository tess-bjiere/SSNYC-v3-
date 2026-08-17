"use client";

import { useMemo, useState, useTransition } from "react";
import { refThumb, type Reference } from "@/lib/types";
import {
  buildPhotographerDirectory,
  groupByGeo,
  type PhotographerProfile,
} from "@/lib/photographers";
import { cityGeo } from "@/lib/geo";
import {
  readAllPhotographerMeta,
  tierLabel,
  EMPTY_META,
  type PhotographerMeta,
  type PhotographerTier,
} from "@/lib/photographerMeta";
import { setPhotographerMeta } from "@/app/actions/photographers";
import Select from "@/app/components/Select";
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

// Photographers, browsed by city (Tess, 2026-08-17: "easy to get to a list of
// people / profiles in different cities ... look at their work"). Built from the
// campaign credits; a profile also shows the team-entered side — tier (FRED at
// home vs campaign), whether they shoot video / direct, and a brief client list.
// The images are still edited from Campaign; only the person's card is edited
// here, and only by the team.
export default function PhotographersClient({
  refs,
  metaValue,
  canEdit = false,
}: {
  refs: Reference[];
  metaValue: unknown;
  canEdit?: boolean;
}) {
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<"" | PhotographerTier>("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [, startStar] = useTransition();
  // Geographic filters — each narrows the next (a continent limits its
  // countries, a country its cities).
  const [continentF, setContinentF] = useState("");
  const [countryF, setCountryF] = useState("");
  const [cityF, setCityF] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Reference | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, PhotographerMeta>>(() =>
    readAllPhotographerMeta(metaValue)
  );

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  const byId = useMemo(() => {
    const m = new Map<string, Reference>();
    for (const r of refs) m.set(r.id, r);
    return m;
  }, [refs]);

  const { cities, photographers } = useMemo(() => buildPhotographerDirectory(refs), [refs]);

  const profileByKey = useMemo(() => {
    const m = new Map<string, PhotographerProfile>();
    for (const p of photographers) m.set(p.key, p);
    return m;
  }, [photographers]);

  // Each city's place, resolved once.
  const cityPlace = (city: string, located: boolean) =>
    located ? cityGeo(city) : { continent: "Unspecified", country: "" };

  // The values available to the geo dropdowns, cascading: countries within the
  // chosen continent, cities within the chosen country/continent.
  const geoOptions = useMemo(() => {
    const rows = cities.map((c) => ({ city: c.city, located: c.located, ...cityPlace(c.city, c.located) }));
    const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean))).sort((x, y) => x.localeCompare(y));
    const inCont = continentF ? rows.filter((r) => r.continent === continentF) : rows;
    const inCountry = countryF ? inCont.filter((r) => r.country === countryF) : inCont;
    return {
      continents: uniq(rows.map((r) => r.continent)),
      countries: uniq(inCont.map((r) => r.country)),
      cities: uniq(inCountry.filter((r) => r.located).map((r) => r.city)),
    };
  }, [cities, continentF, countryF]);

  // Search matches a photographer's name, their city or country, or a brand they
  // have worked with (the images' designers plus their past-work note). The tier
  // and geo filters narrow further; per-city counts are recomputed so a filtered
  // city reads honestly.
  const term = q.trim().toLowerCase();
  const shownCities = useMemo(() => {
    return cities
      .filter((c) => {
        const { continent, country } = cityPlace(c.city, c.located);
        if (continentF && continent !== continentF) return false;
        if (countryF && country !== countryF) return false;
        if (cityF && c.city !== cityF) return false;
        return true;
      })
      .map((c) => {
        const { country } = cityPlace(c.city, c.located);
        const people = c.photographers.filter((p) => {
          if (tierFilter && (meta[p.key]?.tier ?? null) !== tierFilter) return false;
          if (starredOnly && !meta[p.key]?.starred) return false;
          if (!term) return true;
          if (c.city.toLowerCase().includes(term)) return true;
          if (country.toLowerCase().includes(term)) return true;
          if (p.name.toLowerCase().includes(term)) return true;
          const brands = [...(profileByKey.get(p.key)?.shotFor ?? []), meta[p.key]?.pastWork ?? ""]
            .join(" ")
            .toLowerCase();
          return brands.includes(term);
        });
        if (!people.length) return null;
        const count = people.reduce((n, p) => n + p.ids.length, 0);
        return { ...c, photographers: people, count };
      })
      .filter(Boolean) as typeof cities;
  }, [cities, term, tierFilter, starredOnly, continentF, countryF, cityF, meta, profileByKey]);

  // Nest the filtered cities into continent -> country -> city.
  const continents = useMemo(() => groupByGeo(shownCities, cityGeo), [shownCities]);

  // Counts reflect what's shown, so the header tracks the active filter.
  const shownPeople = useMemo(() => {
    const s = new Set<string>();
    for (const c of shownCities) for (const p of c.photographers) s.add(p.key);
    return s.size;
  }, [shownCities]);
  const locatedCities = shownCities.filter((c) => c.located).length;
  // Only offer the tier filter once someone actually has a tier set.
  const hasTiers = useMemo(
    () => photographers.some((p) => meta[p.key]?.tier),
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
      await setPhotographerMeta(key, { starred: next.starred });
    });
  }
  const openProfile = openKey ? profileByKey.get(openKey) ?? null : null;
  const metaFor = (key: string) => meta[key] ?? EMPTY_META;

  const igUrl = (ig: string | null) =>
    ig ? `https://instagram.com/${ig.replace(/^@/, "").trim()}` : null;
  const igLabel = (ig: string) => (ig.startsWith("@") ? ig : "@" + ig);

  // A roster prospect often has no image of their own yet — the card falls back
  // to their initials, and the IG/site link on it is one click to their work.
  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  // The refs behind a photographer that actually carry an image (a roster entry
  // carries none), newest-first.
  const workSrcs = (ids: string[]) =>
    ids.map((id) => { const r = byId.get(id); return r ? refThumb(r) : null; }).filter(Boolean) as string[];

  // One photographer card, reused across every city grid.
  function card(p: { key: string; name: string; ig: string | null; ids: string[] }) {
    const srcs = workSrcs(p.ids);
    const src = srcs[0] ?? null;
    // The handle line: the IG handle, or — for a site-only photographer — the
    // bare domain of their website.
    const site = p.ids.map((id) => byId.get(id)?.link).find(Boolean) || null;
    const handle = p.ig ? igLabel(p.ig) : site ? prettyHost(site) : null;
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

  return (
    <div className="page lib-page">
      <div className="page-head">
        <h1 className="page-title display">Photographers</h1>
        <div className="spacer" />
        {shownPeople > 0 && (
          <span className="pg-count">
            {shownPeople} {shownPeople === 1 ? "photographer" : "photographers"} · {locatedCities}{" "}
            {locatedCities === 1 ? "city" : "cities"}
          </span>
        )}
      </div>

      <div className="lib-bar">
        <input
          className="input lib-search"
          placeholder="Search a photographer, city, country, or a brand they've worked with…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {(hasTiers || hasStarred) && (
        <div className="pg-filters">
          {hasTiers &&
            ([["", "All"], ["home", "FRED at home"], ["campaign", "Campaign"]] as [
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
          <Select
            className="select"
            aria-label="Continent"
            value={continentF}
            onChange={(v) => { setContinentF(v); setCountryF(""); setCityF(""); }}
            options={[
              { value: "", label: "All continents" },
              ...geoOptions.continents.map((v) => ({ value: v, label: v })),
            ]}
          />
          <Select
            className="select"
            aria-label="Country"
            value={countryF}
            onChange={(v) => { setCountryF(v); setCityF(""); }}
            options={[
              { value: "", label: "All countries" },
              ...geoOptions.countries.map((v) => ({ value: v, label: v })),
            ]}
          />
          <Select
            className="select"
            aria-label="City"
            value={cityF}
            onChange={setCityF}
            options={[
              { value: "", label: "All cities" },
              ...geoOptions.cities.map((v) => ({ value: v, label: v })),
            ]}
          />
          {(continentF || countryF || cityF) && (
            <button
              type="button"
              className="btn link"
              onClick={() => { setContinentF(""); setCountryF(""); setCityF(""); }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {shownCities.length === 0 ? (
        <div className="empty">
          {refs.length === 0
            ? "No campaign images yet. Add photographers' work from the Campaign tab and they'll gather here by place."
            : "No photographers match those filters."}
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
                        {c.photographers.length === 1 ? "photographer" : "photographers"}
                      </span>
                    </div>
                    <div className="pg-grid">{c.photographers.map((p) => card(p))}</div>
                  </section>
                ))}
              </div>
            ))}
          </section>
        ))
      )}

      {openProfile && (
        <ProfileModal
          profile={openProfile}
          meta={metaFor(openProfile.key)}
          canEdit={canEdit}
          byId={byId}
          onImage={(r) => setDetail(r)}
          onClose={() => setOpenKey(null)}
          onSaved={(m) => { setMeta((prev) => ({ ...prev, [openProfile.key]: m })); flashToast("Saved"); }}
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// A photographer's profile — their whole body of work with a way into each
// image, the derived "shot for" list, and the team-entered card (tier, video,
// directs, clients) with an inline editor for the team.
function ProfileModal({
  profile,
  meta,
  canEdit,
  byId,
  onImage,
  onClose,
  onSaved,
  igUrl,
  igLabel,
}: {
  profile: PhotographerProfile;
  meta: PhotographerMeta;
  canEdit: boolean;
  byId: Map<string, Reference>;
  onImage: (r: Reference) => void;
  onClose: () => void;
  onSaved: (m: PhotographerMeta) => void;
  igUrl: (ig: string | null) => string | null;
  igLabel: (ig: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PhotographerMeta>(meta);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      await setPhotographerMeta(profile.key, draft);
      setEditing(false);
      onSaved(draft);
    });
  }

  const hasCard =
    !!meta.tier || meta.photo || meta.video || !!meta.pastWork.trim() || !!meta.notes.trim();
  const ig = igUrl(profile.ig);
  // Only the refs that actually carry an image are "work"; a roster entry has
  // none. The website is read off whichever ref carries a link.
  const workRefs = profile.ids
    .map((id) => byId.get(id))
    .filter((r): r is Reference => !!r && !!refThumb(r));
  const site = profile.ids.map((id) => byId.get(id)?.link).find((l) => !!l) || null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pg-profile" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{profile.name}</span>
          <button className="notes-close" onClick={onClose} title="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="pg-profile-meta">
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
            {meta.tier && <span className={"pg-tier pg-tier-" + meta.tier}>{tierLabel(meta.tier)}</span>}
            {meta.photo && <span className="pg-cap">Photo</span>}
            {meta.video && <span className="pg-cap">Video</span>}
            {workRefs.length > 0 && (
              <span className="pg-profile-count">
                {workRefs.length} {workRefs.length === 1 ? "image" : "images"}
              </span>
            )}
          </div>

          {/* Cities they've shot in — derived from the images. */}
          {profile.cities.length > 0 && (
            <div className="pg-facts">
              <span className="k">Cities</span>
              <div className="pg-chips">
                {profile.cities.map((c) => <span className="pg-chip" key={c}>{c}</span>)}
              </div>
            </div>
          )}
          {meta.pastWork.trim() && !editing && (
            <div className="pg-facts">
              <span className="k">Past work</span>
              <div className="pg-clients">{meta.pastWork}</div>
            </div>
          )}
          {meta.notes.trim() && !editing && (
            <div className="pg-facts">
              <span className="k">Notes</span>
              <div className="pg-clients">{meta.notes}</div>
            </div>
          )}

          {/* Team editor for the card. Kept behind an Edit button so viewing is
              clean; a talent never sees it. */}
          {canEdit && !editing && (
            <button type="button" className="btn ghost sm pg-edit-btn" onClick={() => { setDraft(meta); setEditing(true); }}>
              {hasCard ? "Edit profile" : "Add tier, video, clients…"}
            </button>
          )}
          {canEdit && editing && (
            <div className="pg-editor">
              <div className="pg-editor-row">
                <label className="pg-editor-label">Tier</label>
                <div className="pg-seg">
                  {([["home", "FRED at home"], ["campaign", "Campaign"]] as [PhotographerTier, string][]).map(
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
              <div className="pg-editor-row">
                <label className="pg-editor-label">Past work</label>
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
              <div className="pg-editor-tools">
                <button type="button" className="btn sm" disabled={pending} onClick={save}>
                  {pending ? "Saving…" : "Save"}
                </button>
                <button type="button" className="ph-link" disabled={pending} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {workRefs.length > 0 ? (
            <div className="grid dens-md pg-profile-grid">
              {workRefs.map((r) => {
                const src = refThumb(r);
                return (
                  <div className="card lib-card" key={r.id} onClick={() => onImage(r)}>
                    <div className="imgwrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src ?? ""} alt={r.designer || ""} loading="lazy" />
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
              {canEdit && <>, or add a few from the Campaign tab.</>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
