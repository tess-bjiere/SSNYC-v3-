"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sampleRatingLabel } from "@/lib/types";
import { groupByColor, swatchForColor } from "@/lib/linesheet";
import type {
  Linesheet as LinesheetModel,
  LinesheetEntry,
  LinesheetStanding,
} from "@/lib/linesheet";
import {
  addStylesToLinesheet,
  removeStyleFromLinesheet,
  setLinesheetItem,
} from "@/app/actions/linesheets";

// The linesheet, on screen (Tess, 2026-08-12). Two views over the same styles: a
// Grid (the assortment-at-a-glance — every sketch on flowing pages) and Detail
// (one product per page with its facts). Save as PDF is the browser's print, so
// both views print exactly what is on screen — the print CSS handles page breaks
// and orientation. Styles are added from a picker of every style; price and the
// positioning note are edited inline in Detail (the style row carries neither).
//
// Clicking a style opens its profile for now; the factories-and-ratings modal is
// the next phase.

type Pickable = {
  id: string;
  name: string;
  styleNo: string | null;
  garment: string | null;
  thumb: string | null;
  inSheet: boolean;
};

type View = "grid" | "detail";

function RatingDot({ rating }: { rating: string }) {
  if (!rating) return null;
  return (
    <span
      className={"sib-dot " + rating}
      title={`Last judged round came back ${sampleRatingLabel(rating)}`}
      aria-label={`Rated ${sampleRatingLabel(rating)}`}
    />
  );
}

/** The colours line: the colorway images when there are any, else the free-text line. */
function Colors({ entry }: { entry: LinesheetEntry }) {
  if (entry.colorways.length > 0) {
    return (
      <div className="ls-colors">
        {entry.colorways.map((c, i) => (
          <span className="ls-color" key={i} title={c.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ls-color-chip" src={c.url} alt={c.name || "colorway"} />
            {c.name && <span className="ls-color-name">{c.name}</span>}
          </span>
        ))}
      </div>
    );
  }
  if (entry.colors) return <div className="ls-colors-text">{entry.colors}</div>;
  return null;
}

type Cover = { brandLogo: string | null; brandLabel: string; generatedOn: string };

/**
 * Open a style: straight to its profile when only one factory works on it, or a
 * modal of the factories + ratings when there is more than one (Tess,
 * 2026-08-12: "it would open the approved version of the style profile -- or a
 * modal that shows the various factories working on the same style").
 */
function StyleOpener({
  styleId,
  multi,
  onOpen,
  className,
  title,
  children,
}: {
  styleId: string;
  multi: boolean;
  onOpen: (styleId: string) => void;
  className: string;
  title?: string;
  children: React.ReactNode;
}) {
  if (multi) {
    return (
      <button type="button" className={className} title={title} onClick={() => onOpen(styleId)}>
        {children}
      </button>
    );
  }
  return (
    <Link href={`/styles/${styleId}`} className={className} title={title}>
      {children}
    </Link>
  );
}

export default function Linesheet({
  id,
  sheet,
  pickable,
  standings,
  cover,
}: {
  id: string;
  sheet: LinesheetModel;
  pickable: Pickable[];
  standings: Record<string, LinesheetStanding>;
  cover: Cover;
}) {
  const [view, setView] = useState<View>("grid");
  const [picking, setPicking] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [groupColor, setGroupColor] = useState(false);

  // More than one factory works on this garment → a modal offers the choice.
  const multi = (styleId: string) => (standings[styleId]?.versions.length ?? 1) > 1;

  // The PDF names itself from the linesheet — the browser suggests document.title
  // as the filename, the same trick the fitting deck uses.
  const fileTitle = `${sheet.name} — ${sheet.kindLabel} linesheet`;
  useEffect(() => {
    const previous = document.title;
    document.title = fileTitle;
    return () => {
      document.title = previous;
    };
  }, [fileTitle]);

  async function remove(styleId: string) {
    setArmed(null);
    await removeStyleFromLinesheet(id, styleId);
  }

  async function saveField(styleId: string, field: "price" | "note", value: string) {
    await setLinesheetItem(id, styleId, { [field]: value });
  }

  const empty = sheet.entries.length === 0;

  // One grid card. In a colour group, `swatchUrl` is that colourway's image so a
  // multi-colour style shows the right colour under each heading.
  const cell = (e: LinesheetEntry, swatchUrl: string | null = e.sketchUrl) => (
    <div className="ls-cell" key={e.styleId}>
      <StyleOpener
        styleId={e.styleId}
        multi={multi(e.styleId)}
        onOpen={setOpenStyle}
        className="ls-card-style"
        title={e.name}
      >
        <span className={"ls-sketch" + (swatchUrl ? "" : " none")}>
          {swatchUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={swatchUrl} alt={e.name} />
          )}
        </span>
        <span className="ls-cardname">
          {e.name}
          {e.price && <span className="ls-price">{e.price}</span>}
        </span>
        {e.styleNo && <span className="ls-cardno">{e.styleNo}</span>}
      </StyleOpener>
      <Colors entry={e} />
      <button
        type="button"
        className={"ls-remove no-print" + (armed === e.styleId ? " armed" : "")}
        onClick={() => (armed === e.styleId ? remove(e.styleId) : setArmed(e.styleId))}
        onMouseLeave={() => armed === e.styleId && setArmed(null)}
        title="Remove from linesheet"
      >
        {armed === e.styleId ? "Remove?" : "×"}
      </button>
    </div>
  );

  return (
    <div className="page ls-page">
      <div className="ls-head no-print">
        <div className="ls-head-title">
          <Link href="/linesheets" className="count">
            ← Linesheets
          </Link>
          <h1 className="page-title display">{sheet.name}</h1>
          <span className="ls-kind">
            {[sheet.kindLabel, sheet.season].filter(Boolean).join(" · ")}
          </span>
        </div>

        <div className="ls-tools">
          <div className="ls-viewtoggle">
            <button
              type="button"
              className={"ls-view" + (view === "grid" ? " active" : "")}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
            <button
              type="button"
              className={"ls-view" + (view === "detail" ? " active" : "")}
              onClick={() => setView("detail")}
            >
              Detail
            </button>
          </div>
          {view === "grid" && (
            <button
              type="button"
              className={"ls-groupbtn" + (groupColor ? " active" : "")}
              onClick={() => setGroupColor((g) => !g)}
              title="Group the assortment by colour"
            >
              Group by color
            </button>
          )}
          <button type="button" className="btn ghost sm" onClick={() => setPicking(true)}>
            + Add styles
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              document.title = fileTitle;
              window.print();
            }}
          >
            Save as PDF
          </button>
        </div>
      </div>

      {/* The PDF cover — print only (Tess, 2026-08-12: "a cover page as a deck
          designed as though it's being presented to a buyer or agency"). On
          screen the sheet is a working editor; this appears only in the export,
          as its first landscape page. */}
      <section className="ls-cover">
        {cover.brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ls-cover-logo" src={cover.brandLogo} alt={cover.brandLabel} />
        ) : (
          <div className="ls-cover-wordmark">{cover.brandLabel}</div>
        )}
        <div className="ls-cover-mid">
          <h1 className="ls-cover-title">{sheet.name}</h1>
          <p className="ls-cover-sub">
            Linesheet · {sheet.count} {sheet.count === 1 ? "style" : "styles"} · {cover.generatedOn}
          </p>
        </div>
        <p className="ls-cover-foot">Confidential · {cover.brandLabel} · theloyalist.com</p>
      </section>

      {empty ? (
        <div className="empty no-print">
          No styles yet. Use <strong>+ Add styles</strong> to pull styles from Development or the
          Style Library onto this linesheet.
        </div>
      ) : view === "grid" ? (
        groupColor ? (
          <div className="ls-colorgroups">
            {groupByColor(sheet.entries).map((g) => (
              <section className="ls-colorgroup" key={g.color}>
                <h3 className="ls-colorgroup-head">
                  {g.color}
                  <span className="ls-colorgroup-n">{g.entries.length}</span>
                </h3>
                <div className="ls-grid">
                  {g.entries.map((e) => cell(e, swatchForColor(e, g.color)))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="ls-grid">{sheet.entries.map((e) => cell(e))}</div>
        )
      ) : (
        <div className="ls-detail">
          {sheet.entries.map((e) => (
            <section className="ls-entry" key={e.styleId}>
              <StyleOpener
                styleId={e.styleId}
                multi={multi(e.styleId)}
                onOpen={setOpenStyle}
                className={"ls-entry-fig" + (e.empty ? " none" : "")}
              >
                {e.sketchUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.sketchUrl} alt={e.name} />
                )}
                {e.backUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ls-entry-back" src={e.backUrl} alt={`${e.name} — back`} />
                )}
              </StyleOpener>

              <div className="ls-entry-info">
                <header className="ls-entry-head">
                  <StyleOpener
                    styleId={e.styleId}
                    multi={multi(e.styleId)}
                    onOpen={setOpenStyle}
                    className="ls-entry-name"
                  >
                    {e.name}
                  </StyleOpener>
                  {e.subtitle && <p className="ls-entry-sub">{e.subtitle}</p>}
                  <button
                    type="button"
                    className={"ls-remove no-print" + (armed === e.styleId ? " armed" : "")}
                    onClick={() => (armed === e.styleId ? remove(e.styleId) : setArmed(e.styleId))}
                    onMouseLeave={() => armed === e.styleId && setArmed(null)}
                  >
                    {armed === e.styleId ? "Remove?" : "Remove"}
                  </button>
                </header>

                <dl className="ls-facts">
                  <div className="ls-fact">
                    <dt>Estimated Retail</dt>
                    <dd>
                      <input
                        className="input sm ls-field no-print"
                        defaultValue={e.price ?? ""}
                        placeholder="—"
                        onBlur={(ev) => saveField(e.styleId, "price", ev.target.value)}
                        aria-label="Estimated retail"
                      />
                      <span className="ls-field-print">{e.price || "—"}</span>
                    </dd>
                  </div>
                  {e.fabric && (
                    <div className="ls-fact">
                      <dt>Fabric</dt>
                      <dd>{e.fabric}</dd>
                    </div>
                  )}
                  {(e.factory || e.roundLabel || e.rating) && (
                    <div className="ls-fact">
                      <dt>Sample</dt>
                      <dd className="ls-sample">
                        <RatingDot rating={e.rating} />
                        {[e.roundLabel, e.factory].filter(Boolean).join(" · ") || "—"}
                      </dd>
                    </div>
                  )}
                  <div className="ls-fact">
                    <dt>Colors</dt>
                    <dd>
                      <Colors entry={e} />
                    </dd>
                  </div>
                  <div className="ls-fact ls-fact-note">
                    <dt>Positioning</dt>
                    <dd>
                      <textarea
                        className="textarea ls-field ls-note no-print"
                        defaultValue={e.note ?? ""}
                        placeholder="How this piece sits in the range…"
                        onBlur={(ev) => saveField(e.styleId, "note", ev.target.value)}
                        aria-label="Positioning note"
                      />
                      {e.note && <p className="ls-field-print">{e.note}</p>}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
          ))}
        </div>
      )}

      {picking && (
        <AddStyles
          id={id}
          pickable={pickable}
          onClose={() => setPicking(false)}
        />
      )}

      {openStyle && standings[openStyle] && (
        <StyleVersions
          name={sheet.entries.find((e) => e.styleId === openStyle)?.name ?? "Style"}
          standing={standings[openStyle]}
          onClose={() => setOpenStyle(null)}
        />
      )}
    </div>
  );
}

// The factories modal: every factory working on this garment, its latest round
// and rating dot, the approved one badged, each a link into that profile — plus a
// shortcut to the approved profile (Tess, 2026-08-12: "click into any version").
function StyleVersions({
  name,
  standing,
  onClose,
}: {
  name: string;
  standing: LinesheetStanding;
  onClose: () => void;
}) {
  const n = standing.versions.length;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ls-vmodal" onClick={(e) => e.stopPropagation()}>
        <div className="ls-vmodal-head">
          <strong>{name}</strong>
          <span className="ls-vmodal-sub">
            {n} {n === 1 ? "factory" : "factories"}
          </span>
        </div>

        <div className="ls-vmodal-list">
          {standing.versions.map((v) => (
            <Link key={v.styleId} href={`/styles/${v.styleId}`} className="ls-version">
              <span className="ls-version-fac">
                {v.factory || "Unassigned"}
                {v.isSelf && <span className="ls-version-self">on sheet</span>}
              </span>
              <span className="ls-version-mid">
                {v.rating && <RatingDot rating={v.rating} />}
                {v.roundLabel && <span className="ls-version-round">{v.roundLabel}</span>}
                {v.approved && <span className="ls-version-approved">Approved</span>}
              </span>
              <span className="ls-version-go" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>

        <div className="ls-vmodal-foot">
          {standing.approvedStyleId ? (
            <Link href={`/styles/${standing.approvedStyleId}`} className="btn sm">
              Open approved profile
            </Link>
          ) : (
            <span className="ls-vmodal-none">No round approved yet</span>
          )}
          <button type="button" className="btn link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// The add-styles picker: a modal listing every style with a search, styles already
// on the sheet shown ticked and disabled. Same two-click-free flow as the rest —
// pick, Add, done.
function AddStyles({
  id,
  pickable,
  onClose,
}: {
  id: string;
  pickable: Pickable[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pickable;
    return pickable.filter((s) =>
      [s.name, s.styleNo, s.garment].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [q, pickable]);

  function toggle(styleId: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(styleId)) next.delete(styleId);
      else next.add(styleId);
      return next;
    });
  }

  async function add() {
    if (chosen.size === 0) return;
    setSaving(true);
    await addStylesToLinesheet(id, [...chosen]);
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ls-picker" onClick={(e) => e.stopPropagation()}>
        <div className="ls-picker-head">
          <strong>Add styles</strong>
          <input
            className="input sm"
            placeholder="Search styles…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>

        <div className="ls-picker-list">
          {shown.map((s) => {
            const on = chosen.has(s.id);
            return (
              <button
                type="button"
                key={s.id}
                className={"ls-pick" + (on ? " on" : "") + (s.inSheet ? " already" : "")}
                onClick={() => !s.inSheet && toggle(s.id)}
                disabled={s.inSheet}
              >
                <span className="ls-pick-thumb">
                  {s.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumb} alt="" />
                  )}
                </span>
                <span className="ls-pick-name">
                  {s.name}
                  {s.styleNo && <span className="ls-pick-no">{s.styleNo}</span>}
                </span>
                <span className="ls-pick-mark">{s.inSheet ? "On sheet" : on ? "✓" : ""}</span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="ls-picker-empty">No styles match.</p>}
        </div>

        <div className="ls-picker-foot">
          <button type="button" className="btn link" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn sm" onClick={add} disabled={saving || chosen.size === 0}>
            {saving ? "Adding…" : `Add ${chosen.size || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
