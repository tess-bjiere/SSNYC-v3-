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
import DetailModal from "../library/DetailModal";

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

  // Search matches a photographer's name or a city; the tier filter keeps only
  // the people at the chosen tier. Both narrow the same list, and the per-city
  // count is recomputed so a filtered city reads honestly.
  const term = q.trim().toLowerCase();
  const shownCities = useMemo(() => {
    return cities
      .map((c) => {
        const people = c.photographers.filter((p) => {
          if (tierFilter && (meta[p.key]?.tier ?? null) !== tierFilter) return false;
          if (!term) return true;
          return c.city.toLowerCase().includes(term) || p.name.toLowerCase().includes(term);
        });
        if (!people.length) return null;
        const count = people.reduce((n, p) => n + p.ids.length, 0);
        return { ...c, photographers: people, count };
      })
      .filter(Boolean) as typeof cities;
  }, [cities, term, tierFilter, meta]);

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
  const openProfile = openKey ? profileByKey.get(openKey) ?? null : null;
  const metaFor = (key: string) => meta[key] ?? EMPTY_META;

  const igUrl = (ig: string | null) =>
    ig ? `https://instagram.com/${ig.replace(/^@/, "").trim()}` : null;
  const igLabel = (ig: string) => (ig.startsWith("@") ? ig : "@" + ig);

  // One photographer card, reused across every city grid.
  function card(p: { key: string; name: string; ig: string | null; ids: string[] }) {
    const cover = byId.get(p.ids[0]);
    const src = cover ? refThumb(cover) : null;
    return (
      <button
        type="button"
        className="pg-card"
        key={p.key}
        onClick={() => setOpenKey(p.key)}
        title={`See ${p.name}'s work`}
      >
        <div className="pg-card-img">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={p.name} loading="lazy" />
          ) : null}
          {p.ids.length > 1 && <span className="pg-card-count">{p.ids.length}</span>}
        </div>
        <div className="pg-card-name">{p.name}</div>
        {p.ig && <div className="pg-card-ig">{igLabel(p.ig)}</div>}
      </button>
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
          placeholder="Search a photographer or a city…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {hasTiers && (
        <div className="pg-filters">
          {([["", "All"], ["home", "FRED at home"], ["campaign", "Campaign"]] as [
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
                        {c.photographers.length === 1 ? "photographer" : "photographers"} · {c.count}{" "}
                        {c.count === 1 ? "image" : "images"}
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
            {meta.tier && <span className={"pg-tier pg-tier-" + meta.tier}>{tierLabel(meta.tier)}</span>}
            {meta.photo && <span className="pg-cap">Photo</span>}
            {meta.video && <span className="pg-cap">Video</span>}
            <span className="pg-profile-count">
              {profile.ids.length} {profile.ids.length === 1 ? "image" : "images"}
            </span>
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

          <div className="grid dens-md pg-profile-grid">
            {profile.ids.map((id) => {
              const r = byId.get(id);
              if (!r) return null;
              const src = refThumb(r);
              return (
                <div className="card lib-card" key={id} onClick={() => onImage(r)}>
                  <div className="imgwrap">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={r.designer || ""} loading="lazy" />
                    ) : null}
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
        </div>
      </div>
    </div>
  );
}
