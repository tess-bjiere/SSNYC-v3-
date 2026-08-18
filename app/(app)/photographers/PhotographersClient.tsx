"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  setPhotographerMeta,
  addPhotographerImages,
  removePhotographerImage,
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
  // Geographic filters — multi-select (Tess, 2026-08-17: "select multiple cities,
  // countries"). Each narrows the next: chosen continents limit the country
  // options, chosen countries limit the cities. Empty at a level means "all".
  const [continentF, setContinentF] = useState<string[]>([]);
  const [countryF, setCountryF] = useState<string[]>([]);
  const [cityF, setCityF] = useState<string[]>([]);
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
  onToast,
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
  onToast: (m: string) => void;
  igUrl: (ig: string | null) => string | null;
  igLabel: (ig: string) => string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PhotographerMeta>(meta);
  const [pending, start] = useTransition();
  const imgInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function save() {
    start(async () => {
      await setPhotographerMeta(profile.key, draft);
      setEditing(false);
      onSaved(draft);
    });
  }

  const ig = igUrl(profile.ig);
  // Only the refs that actually carry an image are "work"; a roster entry has
  // none. The website is read off whichever ref carries a link.
  const workRefsRaw = useMemo(
    () =>
      profile.ids
        .map((id) => byId.get(id))
        .filter((r): r is Reference => !!r && !!refThumb(r)),
    [profile.ids, byId]
  );
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
  const site = profile.ids.map((id) => byId.get(id)?.link).find((l) => !!l) || null;

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
      await setPhotographerMeta(profile.key, { imageOrder: ids });
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
      await removePhotographerImage(id);
      router.refresh();
    });
  }
  // Where this photographer sits — carried onto the images so they land in the
  // same city they do.
  const location = profile.ids.map((id) => byId.get(id)?.location).find((l) => !!l) || "";

  // Upload the shots the team picks. Each becomes a roster row under this
  // photographer's name; a refresh pulls them straight back into the grid.
  async function addImages(list: FileList | null) {
    if (!canEdit) return;
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    try {
      const res = await addPhotographerImages(profile.name, location, fd);
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal pg-profile"
        onClick={(e) => e.stopPropagation()}
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
                onClick={() => { setDraft(meta); setEditing(true); }}
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
          {meta.tier && !editing && (
            <div className="pg-facts">
              <span className="k">Tier</span>
              <div className="pg-fact-val">{tierLabel(meta.tier)}</div>
            </div>
          )}
          {(meta.photo || meta.video) && !editing && (
            <div className="pg-facts">
              <span className="k">Medium</span>
              <div className="pg-fact-val">
                {[meta.photo && "Photo", meta.video && "Video"].filter(Boolean).join(" · ")}
              </div>
            </div>
          )}
          {profile.cities.length > 0 && (
            <div className="pg-facts">
              <span className="k">Cities</span>
              <div className="pg-fact-val">{profile.cities.join(", ")}</div>
            </div>
          )}
          {meta.pastWork.trim() && !editing && (
            <div className="pg-facts">
              <span className="k">Past work</span>
              <div className="pg-fact-val">{meta.pastWork}</div>
            </div>
          )}
          {meta.notes.trim() && !editing && (
            <div className="pg-facts">
              <span className="k">Notes</span>
              <div className="pg-fact-val">{meta.notes}</div>
            </div>
          )}

          {/* Team editor for the card. Opened from the "Edit profile" button in
              the header; a talent never sees it. */}
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

          {/* Team uploads the photographer's own work here — the FRED-at-home
              shots. Hidden input driven by the button, plus drop-anywhere on the
              modal (Tess likes drag-to-upload). */}
          {canEdit && (
            <div className="pg-upload">
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
                {uploading ? "Uploading…" : workRefs.length ? "+ Add images" : "+ Add FRED-at-home images"}
              </button>
              <span className="pg-upload-hint">Pick the 3–5 shots that feel most FRED at home — or drag them in.</span>
            </div>
          )}

          {canEdit && workRefs.length > 1 && (
            <div className="pg-reorder-hint">Drag to reorder</div>
          )}
          {workRefs.length > 0 ? (
            <div className="grid dens-md pg-profile-grid">
              {items.map((r) => {
                const src = refThumb(r);
                return (
                  <div
                    className={"card lib-card" + (canEdit ? " pg-drag" : "")}
                    key={r.id}
                    onClick={() => onImage(r)}
                    draggable={canEdit}
                    onDragStart={canEdit ? () => { dragId.current = r.id; } : undefined}
                    onDragOver={canEdit ? (e) => { e.preventDefault(); reorderTo(r.id); } : undefined}
                    onDrop={canEdit ? (e) => { e.preventDefault(); commitOrder(); } : undefined}
                    onDragEnd={canEdit ? commitOrder : undefined}
                  >
                    <div className="imgwrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src ?? ""} alt={r.designer || ""} loading="lazy" draggable={false} />
                      {canEdit && (
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
              {canEdit && <>, then add the FRED-at-home ones with the button above.</>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
