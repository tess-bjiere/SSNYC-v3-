"use client";

import { useMemo, useState } from "react";
import { refThumb, type Reference } from "@/lib/types";
import {
  buildPhotographerDirectory,
  type PhotographerProfile,
} from "@/lib/photographers";
import DetailModal from "../library/DetailModal";

// Photographers, browsed by city (Tess, 2026-08-17: "easy to get to a list of
// people / profiles in different cities ... look at their work"). Built from the
// campaign credits — no photographer table. A city section lists the people who
// have shot there; opening one shows their whole body of work and where it was
// made. Everything here is derived, so it is read-only: the images are still
// edited from Campaign, and clicking one opens the same detail card.
export default function PhotographersClient({ refs }: { refs: Reference[] }) {
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Reference | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  const byId = useMemo(() => {
    const m = new Map<string, Reference>();
    for (const r of refs) m.set(r.id, r);
    return m;
  }, [refs]);

  const { cities, photographers } = useMemo(
    () => buildPhotographerDirectory(refs),
    [refs]
  );

  const profileByKey = useMemo(() => {
    const m = new Map<string, PhotographerProfile>();
    for (const p of photographers) m.set(p.key, p);
    return m;
  }, [photographers]);

  // Search filters photographers by name; a city whose NAME matches keeps all of
  // its people, so "paris" finds the city and "ada" finds the person.
  const term = q.trim().toLowerCase();
  const shownCities = useMemo(() => {
    if (!term) return cities;
    return cities
      .map((c) => {
        if (c.city.toLowerCase().includes(term)) return c;
        const people = c.photographers.filter((p) => p.name.toLowerCase().includes(term));
        return people.length ? { ...c, photographers: people } : null;
      })
      .filter(Boolean) as typeof cities;
  }, [cities, term]);

  const totalPeople = photographers.length;
  const openProfile = openKey ? profileByKey.get(openKey) ?? null : null;

  const igUrl = (ig: string | null) =>
    ig ? `https://instagram.com/${ig.replace(/^@/, "").trim()}` : null;

  return (
    <div className="page lib-page">
      <div className="page-head">
        <h1 className="page-title display">Photographers</h1>
        <div className="spacer" />
        {totalPeople > 0 && (
          <span className="pg-count">
            {totalPeople} {totalPeople === 1 ? "photographer" : "photographers"} ·{" "}
            {cities.filter((c) => c.located).length}{" "}
            {cities.filter((c) => c.located).length === 1 ? "city" : "cities"}
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

      {shownCities.length === 0 ? (
        <div className="empty">
          {refs.length === 0
            ? "No campaign images yet. Add photographers' work from the Campaign tab and they'll gather here by city."
            : "No photographers or cities match that search."}
        </div>
      ) : (
        shownCities.map((c) => (
          <section className="pg-city" key={c.city}>
            <div className="pg-city-head">
              <h2 className={"pg-city-name" + (c.located ? "" : " muted")}>{c.city}</h2>
              <span className="pg-city-meta">
                {c.photographers.length} {c.photographers.length === 1 ? "photographer" : "photographers"}
                {" · "}
                {c.count} {c.count === 1 ? "image" : "images"}
              </span>
            </div>

            <div className="pg-grid">
              {c.photographers.map((p) => {
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
                    {p.ig && <div className="pg-card-ig">{p.ig.startsWith("@") ? p.ig : "@" + p.ig}</div>}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* A photographer's profile — their whole body of work, across every city,
          with a way into each image's full credits. */}
      {openProfile && (
        <div className="modal-overlay" onClick={() => setOpenKey(null)}>
          <div className="modal pg-profile" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>{openProfile.name}</span>
              <button className="notes-close" onClick={() => setOpenKey(null)} title="Close">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="pg-profile-meta">
                {igUrl(openProfile.ig) && (
                  <a className="pg-profile-ig" href={igUrl(openProfile.ig)!} target="_blank" rel="noreferrer">
                    {openProfile.ig!.startsWith("@") ? openProfile.ig : "@" + openProfile.ig}
                  </a>
                )}
                <div className="pg-profile-cities">
                  {openProfile.cities.map((city) => (
                    <span className="pg-chip" key={city}>
                      {city}
                    </span>
                  ))}
                </div>
                <span className="pg-profile-count">
                  {openProfile.ids.length} {openProfile.ids.length === 1 ? "image" : "images"}
                </span>
              </div>

              <div className="grid dens-md pg-profile-grid">
                {openProfile.ids.map((id) => {
                  const r = byId.get(id);
                  if (!r) return null;
                  const src = refThumb(r);
                  return (
                    <div className="card lib-card" key={id} onClick={() => setDetail(r)}>
                      <div className="imgwrap">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={r.designer || ""} loading="lazy" />
                        ) : null}
                      </div>
                      <div className="meta">
                        <div className="s">
                          {[r.location, r.year && r.year !== "Unknown" ? r.year : null]
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
