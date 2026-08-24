"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { sampleRatingLabel } from "@/lib/types";
import { groupByColor, swatchForColor, baseColorNames, LINESHEET_LAYOUTS } from "@/lib/linesheet";
import SizeToggle from "@/app/components/SizeToggle";
import Select from "@/app/components/Select";
import Linked from "@/app/components/Linked";
import type {
  Linesheet as LinesheetModel,
  LinesheetEntry,
  LinesheetStanding,
  LinesheetColorName,
  LinesheetLayout,
} from "@/lib/linesheet";
import {
  addStylesToLinesheet,
  removeStyleFromLinesheet,
  setLinesheetItem,
  setLinesheetColors,
  setLinesheetLayout,
  renameLinesheet,
  reorderLinesheet,
  deleteLinesheet,
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

/**
 * The colours, each as a round swatch and its name (Tess, 2026-08-12: "include
 * circles for color swatches"). A colourway swatch is its uploaded image, cropped
 * to a circle; a free-text colour becomes a filled dot when its name is a real CSS
 * colour (black, olive…) and a plain outlined dot otherwise, since a style row has
 * no hex to draw from.
 */
function Colors({ entry }: { entry: LinesheetEntry }) {
  // A per-sheet override wins and is drawn as named dots filled by its hex (or the
  // colour word when no hex was picked); otherwise the colorway photos, else the
  // style's free-text colours.
  const swatches: { name: string; url: string | null; hex: string | null }[] =
    entry.colorOverride !== null
      ? entry.colorOverride.map((c) => ({ name: c.name, url: null, hex: c.hex }))
      : entry.colorways.length > 0
        ? entry.colorways.map((c) => ({ name: c.name, url: c.url, hex: null }))
        : entry.colors
          ? entry.colors
              .split(/[/,]/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((name) => ({ name, url: null, hex: null }))
          : [];
  if (swatches.length === 0) return null;
  return (
    <div className="ls-colors">
      {swatches.map((s, i) => (
        <span className="ls-color" key={i} title={s.name}>
          {s.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ls-color-chip" src={s.url} alt={s.name || "color"} />
          ) : (
            <span
              className="ls-color-chip"
              style={{ background: s.hex ?? s.name.toLowerCase() }}
              aria-hidden="true"
            />
          )}
          {s.name && <span className="ls-color-name">{s.name}</span>}
        </span>
      ))}
    </div>
  );
}

/**
 * Add and remove a style's colours on this sheet, in the detail view (Tess,
 * 2026-08-12: "add ability to add / remove colors from styles on line sheet in
 * detail view"). Edits names only — a filled dot when the name is a real CSS
 * colour, an outlined dot otherwise. The first edit materialises the style's own
 * colours into the sheet's override, then adds to or removes from that.
 */
function ColorsEditor({
  entry,
  onSave,
}: {
  entry: LinesheetEntry;
  onSave: (colors: LinesheetColorName[]) => void;
}) {
  const [adding, setAdding] = useState("");
  // The hex picker (Tess, 2026-08-12: "use hex picker for adding color as well and
  // give custom name"). A picked hex fills the swatch; if the swatch is left
  // untouched the colour name resolves on its own (a CSS colour word, else a
  // neutral dot), so typing "Olive" still works without opening the picker.
  const [hex, setHex] = useState("#000000");
  const [picked, setPicked] = useState(false);
  const current: LinesheetColorName[] =
    entry.colorOverride ?? baseColorNames(entry).map((name) => ({ name, hex: null }));

  function add() {
    const v = adding.trim();
    if (!v) return;
    if (!current.some((c) => c.name.toLowerCase() === v.toLowerCase())) {
      onSave([...current, { name: v, hex: picked ? hex : null }]);
    }
    setAdding("");
    setPicked(false);
  }
  function drop(name: string) {
    onSave(current.filter((c) => c.name.toLowerCase() !== name.toLowerCase()));
  }

  return (
    <div className="ls-coloredit no-print">
      <div className="ls-coloredit-chips">
        {current.map((c, i) => (
          <span className="ls-coloredit-chip" key={i}>
            <span
              className="ls-color-chip"
              style={{ background: c.hex ?? c.name.toLowerCase() }}
              aria-hidden="true"
            />
            <span className="ls-coloredit-name">{c.name}</span>
            <button
              type="button"
              className="ls-coloredit-x"
              onClick={() => drop(c.name)}
              title={`Remove ${c.name}`}
              aria-label={`Remove ${c.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {current.length === 0 && <span className="ls-coloredit-empty">No colors</span>}
      </div>
      <div className="ls-coloredit-add">
        <input
          type="color"
          className="ls-hexpick"
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            setPicked(true);
          }}
          title="Pick a swatch colour"
          aria-label="Pick a swatch colour"
        />
        <input
          className="input sm"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Color name…"
          aria-label="Color name"
        />
        <button type="button" className="btn link sm" onClick={add} disabled={!adding.trim()}>
          Add
        </button>
      </div>
    </div>
  );
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
  // The name is editable in place (Tess, 2026-08-12: "you should be able to edit
  // linesheet name"). Kept in local state so the header, the PDF filename and the
  // cover title all track the edit immediately; the server revalidation that
  // follows the save re-seeds it from the prop.
  const [name, setName] = useState(sheet.name);
  const [editingName, setEditingName] = useState(false);
  const [picking, setPicking] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [groupColor, setGroupColor] = useState(false);
  // The grid-density toggle (Tess, 2026-08-12: "add options column toggle icons"),
  // the same SizeToggle the References/Development grids use so the icons match.
  const [size, setSize] = useState("md");
  // The linesheet's own Delete — two-click armed, no confirm(); the action
  // soft-deletes and redirects to the list.
  const [delArmed, setDelArmed] = useState(false);

  // Drag-to-reorder (Tess, 2026-08-12: "add ability to Reorganize line sheet
  // order by dragging"). The order lives here as a list of style ids so a drag
  // reflows the assortment immediately; reorderLinesheet persists it and the
  // server revalidation re-seeds from the saved items. A small grip handle is the
  // drag source, so the card stays clickable and the detail view's fields stay
  // selectable; each card/row is the drop target.
  const [order, setOrder] = useState<string[]>(() => sheet.entries.map((e) => e.styleId));
  const [dragId, setDragId] = useState<string | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => {
    setOrder(sheet.entries.map((e) => e.styleId));
  }, [sheet.entries]);

  const byId = useMemo(
    () => new Map(sheet.entries.map((e) => [e.styleId, e] as const)),
    [sheet.entries]
  );
  const ordered = useMemo(
    () => order.map((sid) => byId.get(sid)).filter((e): e is LinesheetEntry => Boolean(e)),
    [order, byId]
  );

  function reorderTo(targetId: string) {
    setOrder((prev) => {
      if (!dragId || dragId === targetId) return prev;
      const next = prev.filter((x) => x !== dragId);
      const at = next.indexOf(targetId);
      if (at < 0) return prev;
      next.splice(at, 0, dragId);
      return next;
    });
  }
  async function commitOrder() {
    const finalOrder = orderRef.current;
    setDragId(null);
    await reorderLinesheet(id, finalOrder);
  }
  // The grip handle: the one draggable element, so a drag never fights the card's
  // click or a field's text selection.
  const dragHandle = (styleId: string) => (
    <span
      className="ls-drag no-print"
      draggable
      onDragStart={(ev) => {
        setDragId(styleId);
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", styleId); // Firefox needs data to start a drag
      }}
      onDragEnd={commitOrder}
      title="Drag to reorder"
      aria-label="Drag to reorder"
    >
      ⠿
    </span>
  );
  // Drop-target props for a card/row: allow the drop and reflow as the grip passes over.
  const dropProps = (styleId: string) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (dragId) ev.preventDefault();
    },
    onDragEnter: () => {
      if (dragId) reorderTo(styleId);
    },
  });

  // More than one factory works on this garment → a modal offers the choice.
  const multi = (styleId: string) => (standings[styleId]?.versions.length ?? 1) > 1;

  // Follow the saved name when the server sends fresh props after a rename.
  useEffect(() => setName(sheet.name), [sheet.name]);

  // The PDF names itself from the linesheet — the browser suggests document.title
  // as the filename, the same trick the fitting deck uses.
  const fileTitle = `${name} — ${sheet.kindLabel} linesheet`;
  useEffect(() => {
    const previous = document.title;
    document.title = fileTitle;
    return () => {
      document.title = previous;
    };
  }, [fileTitle]);

  async function saveName() {
    setEditingName(false);
    const next = name.trim();
    if (!next || next === sheet.name) {
      setName(sheet.name);
      return;
    }
    setName(next);
    const fd = new FormData();
    fd.set("name", next);
    await renameLinesheet(id, fd);
  }

  async function remove(styleId: string) {
    setArmed(null);
    await removeStyleFromLinesheet(id, styleId);
  }

  async function saveField(styleId: string, field: "price" | "note" | "delivery", value: string) {
    await setLinesheetItem(id, styleId, { [field]: value });
  }

  // The whole sheet's Detail export layout (Tess, 2026-08-24). Optimistic so the
  // pages re-flow at once; the server revalidation re-seeds from the saved column.
  const [layout, setLayout] = useState<LinesheetLayout>(sheet.layout);
  useEffect(() => setLayout(sheet.layout), [sheet.layout]);
  async function chooseLayout(next: LinesheetLayout) {
    setLayout(next);
    await setLinesheetLayout(id, next);
  }

  // Per-sheet colour edits, applied optimistically so a chip appears/disappears
  // at once; the server revalidation re-seeds from the saved items and clears this.
  const [colorEdits, setColorEdits] = useState<Record<string, LinesheetColorName[]>>({});
  useEffect(() => setColorEdits({}), [sheet.entries]);
  const withColors = (e: LinesheetEntry): LinesheetEntry =>
    e.styleId in colorEdits ? { ...e, colorOverride: colorEdits[e.styleId] } : e;
  async function saveColors(styleId: string, colors: LinesheetColorName[]) {
    setColorEdits((m) => ({ ...m, [styleId]: colors }));
    await setLinesheetColors(id, styleId, colors);
  }

  const empty = sheet.entries.length === 0;

  // One grid card. In a colour group, `swatchUrl` is that colourway's image so a
  // multi-colour style shows the right colour under each heading. `canDrag` is off
  // in the colour-grouped view, where a style can sit in several groups and a
  // single linear order has no meaning.
  const cell = (e: LinesheetEntry, swatchUrl: string | null = e.sketchUrl, canDrag = true) => (
    <div
      className={"ls-cell" + (dragId === e.styleId ? " dragging" : "")}
      key={e.styleId}
      {...(canDrag ? dropProps(e.styleId) : {})}
    >
      {canDrag && dragHandle(e.styleId)}
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
      <Colors entry={withColors(e)} />
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
          {editingName ? (
            <input
              className="page-title display ls-name-edit"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  setName(sheet.name);
                  setEditingName(false);
                }
              }}
              aria-label="Linesheet name"
            />
          ) : (
            <h1
              className="page-title display ls-name"
              onClick={() => setEditingName(true)}
              title="Rename linesheet"
            >
              {name}
            </h1>
          )}
          <span className="ls-kind">
            {[sheet.kindLabel, sheet.subtitle].filter(Boolean).join(" · ")}
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
          {view === "grid" && <SizeToggle value={size} onChange={setSize} />}
          {view === "detail" && (
            <Select
              className="select sm ls-layout"
              aria-label="Page layout"
              value={layout}
              onChange={(v) => chooseLayout(v as LinesheetLayout)}
              options={LINESHEET_LAYOUTS.map((l) => ({ value: l.key, label: l.label }))}
              title="How each product page is laid out in the export"
            />
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
          <button
            type="button"
            className={"btn link ls-delete" + (delArmed ? " armed" : "")}
            onClick={() => (delArmed ? deleteLinesheet(id) : setDelArmed(true))}
            onMouseLeave={() => setDelArmed(false)}
            title="Delete this linesheet"
          >
            {delArmed ? "Delete linesheet?" : "Delete"}
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
          <h1 className="ls-cover-title">{name}</h1>
          <p className="ls-cover-sub">
            Linesheet · {sheet.count} {sheet.count === 1 ? "style" : "styles"} · {cover.generatedOn}
          </p>
        </div>
        <p className="ls-cover-foot">Confidential · {cover.brandLabel}</p>
      </section>

      {empty ? (
        <div className="empty no-print">
          No styles yet. Use <strong>+ Add styles</strong> to pull styles from Development or the
          Style Library onto this linesheet.
        </div>
      ) : view === "grid" ? (
        groupColor ? (
          <div className="ls-colorgroups">
            {groupByColor(ordered.map(withColors)).map((g) => (
              <section className="ls-colorgroup" key={g.color}>
                <h3 className="ls-colorgroup-head">
                  {g.color}
                  <span className="ls-colorgroup-n">{g.entries.length}</span>
                </h3>
                <div className={"ls-grid dens-" + size}>
                  {g.entries.map((e) => cell(e, swatchForColor(e, g.color), false))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={"ls-grid dens-" + size}>{ordered.map((e) => cell(e))}</div>
        )
      ) : (
        <div className={"ls-detail ls-lay-" + layout}>
          {ordered.map((e) => (
            <section
              className={"ls-entry" + (dragId === e.styleId ? " dragging" : "")}
              key={e.styleId}
              {...dropProps(e.styleId)}
            >
              {dragHandle(e.styleId)}

              {/* IMAGE ZONE — kept apart from the text so the two never jumble
                  (Tess, 2026-08-24: "Rework detail line sheet exports so images are
                  not jumbled with text"). What fills it is the sheet's chosen
                  layout: colourway photos as a grid, a model hero, or the flats. */}
              <StyleOpener
                styleId={e.styleId}
                multi={multi(e.styleId)}
                onOpen={setOpenStyle}
                className={"ls-visual" + (e.empty && !e.modelUrl ? " none" : "")}
              >
                {layout === "colorways" ? (
                  e.colorways.length > 0 ? (
                    <div className="ls-cw-grid">
                      {e.colorways.map((c, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={c.url} alt={c.name || e.name} title={c.name} />
                      ))}
                    </div>
                  ) : e.sketchUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ls-hero" src={e.sketchUrl} alt={e.name} />
                  ) : null
                ) : layout === "model" ? (
                  (e.modelUrl || e.sketchUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ls-hero" src={(e.modelUrl || e.sketchUrl) ?? ""} alt={e.name} />
                  )
                ) : (
                  <div className="ls-flats">
                    {e.sketchUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.sketchUrl} alt={e.name} />
                    )}
                    {e.backUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.backUrl} alt={`${e.name} — back`} />
                    )}
                  </div>
                )}
              </StyleOpener>

              {/* TEXT ZONE — the market anatomy: eyebrow, serif title, the facts,
                  the wordmark. */}
              <div className="ls-entry-info">
                <p className="ls-eyebrow">{sheet.subtitle || sheet.kindLabel}</p>
                <header className="ls-entry-head">
                  <StyleOpener
                    styleId={e.styleId}
                    multi={multi(e.styleId)}
                    onOpen={setOpenStyle}
                    className="ls-entry-name"
                  >
                    {e.name}.
                  </StyleOpener>
                  {e.styleNo && <span className="ls-eno no-print">{e.styleNo}</span>}
                  <button
                    type="button"
                    className={"ls-remove no-print" + (armed === e.styleId ? " armed" : "")}
                    onClick={() => (armed === e.styleId ? remove(e.styleId) : setArmed(e.styleId))}
                    onMouseLeave={() => armed === e.styleId && setArmed(null)}
                  >
                    {armed === e.styleId ? "Remove?" : "Remove"}
                  </button>
                </header>

                {/* On the model layout the flats sit small beside the facts (PDF
                    layout 1), so the drawing still ships without stealing the hero. */}
                {layout === "model" && (e.sketchUrl || e.backUrl) && (
                  <div className="ls-flats-mini">
                    {e.sketchUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.sketchUrl} alt="" />
                    )}
                    {e.backUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.backUrl} alt="" />
                    )}
                  </div>
                )}

                <dl className="ls-facts">
                  <div className="ls-fact">
                    <dt>Retail</dt>
                    <dd>
                      <input
                        className="input sm ls-field no-print"
                        defaultValue={e.price ?? ""}
                        placeholder="—"
                        onBlur={(ev) => saveField(e.styleId, "price", ev.target.value)}
                        aria-label="Retail"
                      />
                      <span className="ls-field-print">{e.price || "—"}</span>
                    </dd>
                  </div>
                  <div className="ls-fact">
                    <dt>Color</dt>
                    <dd>
                      <ColorsEditor
                        entry={withColors(e)}
                        onSave={(cols) => saveColors(e.styleId, cols)}
                      />
                      <div className="ls-field-print">
                        <Colors entry={withColors(e)} />
                      </div>
                    </dd>
                  </div>
                  <div className="ls-fact ls-fact-details">
                    <dt>Fabric / Details</dt>
                    <dd>
                      {e.fabric && <div className="ls-fabric">{e.fabric}</div>}
                      <textarea
                        className="textarea ls-field ls-note no-print"
                        defaultValue={e.note ?? ""}
                        placeholder="Fabric make-up and detail points — one per line, use “- ” for bullets."
                        onBlur={(ev) => saveField(e.styleId, "note", ev.target.value)}
                        aria-label="Fabric / details"
                      />
                      {e.note && (
                        <div className="ls-field-print">
                          <Linked text={e.note} block />
                        </div>
                      )}
                    </dd>
                  </div>
                  <div className="ls-fact">
                    <dt>Delivery</dt>
                    <dd>
                      <input
                        className="input sm ls-field no-print"
                        defaultValue={e.delivery ?? ""}
                        placeholder="e.g. February 15"
                        onBlur={(ev) => saveField(e.styleId, "delivery", ev.target.value)}
                        aria-label="Delivery"
                      />
                      <span className="ls-field-print">{e.delivery || "—"}</span>
                    </dd>
                  </div>
                  {/* Sample / factory is internal — on screen for the merchandiser,
                      never in the buyer-facing export. */}
                  {(e.factory || e.roundLabel || e.rating) && (
                    <div className="ls-fact ls-sample-fact no-print">
                      <dt>Sample</dt>
                      <dd className="ls-sample">
                        <RatingDot rating={e.rating} />
                        {[e.roundLabel, e.factory].filter(Boolean).join(" · ") || "—"}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="ls-wordmark">{cover.brandLabel}</div>
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
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div className="modal ls-vmodal">
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
    <div className="modal-overlay">
          {/* The backdrop is scenery, not a control (Tess, 2026-08-19: "if i click
          outside the box it closes -- that's creating an issue for me as i keep
          losing information accidentally before saving"). It used to close on
          click, and a click here is easier to land by accident than it looks: a
          drag that starts in a text field and releases on the backdrop fires its
          click on the OVERLAY, so the modal's own stopPropagation never saw it.
          Close or a save are the ways out. */}
      <div className="modal ls-picker">
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
