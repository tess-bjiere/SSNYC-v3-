"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Select from "@/app/components/Select";
import { ORDER_STATUSES, ORDER_UNITS, docLabel, type Order, type OrderKind } from "@/lib/materialOrder";
import {
  renameOrder,
  setOrderStatus,
  setOrderMeta,
  setOrderLine,
  removeOrderLine,
  addMaterialsToOrder,
  deleteOrder,
} from "@/app/actions/materialOrders";

export type PickMaterial = {
  id: string;
  name: string;
  kind: "fabric" | "trim" | "packaging";
  supplier: string | null;
  spec: string;
  thumb: string | null;
  inOrder: boolean;
};

// One material order — the working view. Lines grouped by supplier, each with an
// editable quantity / unit / note, an add-materials picker, a status, a
// delivery address and notes, and a Save-as-PDF that prints a clean purchase
// order (one page per supplier). Mirrors the linesheet's client.
export default function OrderClient({
  id,
  kind = "order",
  order,
  shipTo,
  notes,
  pickable,
  cover,
}: {
  id: string;
  // 'quote' drops the quantity and unit columns and relabels the document (Tess,
  // 2026-08-26: "the same as the order page but doesnt include quantity or price
  // and allows for notes to be added"). Everything else — the supplier grouping,
  // the per-line note, the material spec and its AI-file link — is identical.
  kind?: OrderKind;
  order: Order;
  shipTo: string;
  notes: string;
  pickable: PickMaterial[];
  cover: { brandLogo: string | null; brandLabel: string; generatedOn: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const quote = kind === "quote";
  const listPath = quote ? "/quotes" : "/material-orders";
  const noun = quote ? "quote" : "order";

  // Name — click to rename, like the linesheet.
  const [name, setName] = useState(order.name);
  const [editingName, setEditingName] = useState(false);
  useEffect(() => setName(order.name), [order.name]);

  // Delivery address + notes, saved on blur.
  const [ship, setShip] = useState(shipTo);
  const [note, setNote] = useState(notes);
  useEffect(() => setShip(shipTo), [shipTo]);
  useEffect(() => setNote(notes), [notes]);

  const [adding, setAdding] = useState(false);
  const [armDelete, setArmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1600);
  }

  // The PDF names itself from the order — the browser suggests document.title as
  // the filename, the same trick the linesheet and fitting deck use.
  const fileTitle = `${name} — ${noun}`;
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
    if (!next || next === order.name) {
      setName(order.name);
      return;
    }
    setName(next);
    const fd = new FormData();
    fd.set("name", next);
    await renameOrder(id, fd);
  }

  function changeStatus(s: string) {
    start(async () => {
      await setOrderStatus(id, s);
      router.refresh();
    });
  }

  async function saveShip() {
    if (ship === shipTo) return;
    await setOrderMeta(id, { ship_to: ship });
  }
  async function saveNote() {
    if (note === notes) return;
    await setOrderMeta(id, { notes: note });
  }

  function remove(materialId: string) {
    start(async () => {
      await removeOrderLine(id, materialId);
      router.refresh();
    });
  }

  function doDelete() {
    start(async () => {
      await deleteOrder(id);
      // deleteOrder redirects to the list; refresh as a fallback.
      router.push(listPath);
    });
  }

  async function addChosen(ids: string[]) {
    setAdding(false);
    if (ids.length === 0) return;
    const res = await addMaterialsToOrder(id, ids);
    router.refresh();
    flash(res.added > 0 ? `Added ${res.added}` : "Already on the order");
  }

  const empty = order.count === 0;

  return (
    <div className={"page mo-page" + (quote ? " mo-quote" : "")}>
      {/* --- Toolbar (not printed) --- */}
      <div className="page-head mo-head no-print">
        <div className="mo-title-wrap">
          {editingName ? (
            <input
              className="input mo-name-input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(order.name);
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <h1 className="page-title display mo-name" onClick={() => setEditingName(true)} title="Rename">
              {name}
            </h1>
          )}
          <div className="mo-sub">
            {order.count} {order.count === 1 ? "line" : "lines"}
            {order.supplierCount > 0 && ` · ${order.supplierCount} ${order.supplierCount === 1 ? "supplier" : "suppliers"}`}
          </div>
        </div>
        <div className="spacer" />
        <Select
          className="select sm mo-status"
          aria-label="Status"
          value={order.status}
          onChange={changeStatus}
          options={ORDER_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
        />
        <button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>
          + Add materials
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

      {/* --- The order body — this is what prints --- */}
      <div className="mo-doc">
        {/* Print-only masthead. */}
        <div className="mo-print-head print-only">
          {cover.brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mo-print-logo" src={cover.brandLogo} alt={cover.brandLabel} />
          ) : (
            <div className="mo-print-wordmark">{cover.brandLabel}</div>
          )}
          <div className="mo-print-meta">
            <div className="mo-print-title">{name}</div>
            <div className="mo-print-date">
              {docLabel(kind)} · {order.statusLabel} · {cover.generatedOn}
            </div>
          </div>
        </div>

        {/* Ship-to and the general notes print ONCE, here on page 1, not repeated
            at the foot of every supplier page (Tess, 2026-08-26: "dont put ship to
            and general notes on bottom of every page ... those sections should only
            live on page 1"). Each is its own block with its lines kept, shown the
            way the tool holds them rather than squeezed onto a single line. */}
        {(ship.trim() || note.trim()) && (
          <div className="mo-doc-meta print-only">
            {ship.trim() && (
              <div className="mo-doc-meta-block">
                <div className="mo-doc-meta-k">Ship to</div>
                <div className="mo-doc-meta-v">{ship}</div>
              </div>
            )}
            {note.trim() && (
              <div className="mo-doc-meta-block">
                <div className="mo-doc-meta-k">{quote ? "Quote notes" : "Order notes"}</div>
                <div className="mo-doc-meta-v">{note}</div>
              </div>
            )}
          </div>
        )}

        {empty ? (
          <div className="empty no-print">
            No materials on this {noun} yet. Use “+ Add materials”, or select materials in the
            library and choose “Add to order”.
          </div>
        ) : (
          order.groups.map((g) => (
            <section className="mo-group" key={g.supplier}>
              <div className="mo-group-head">
                <span className={"mo-supplier" + (g.unassigned ? " mo-unassigned" : "")}>
                  {g.supplier}
                </span>
                <span className="mo-group-n">
                  {g.entries.length} {g.entries.length === 1 ? "line" : "lines"}
                </span>
              </div>

              <div className="mo-lines">
                {/* Header row (screen + print). */}
                <div className="mo-line mo-line-head">
                  <span className="mo-cell-img" />
                  <span className="mo-cell-name">Material</span>
                  <span className="mo-cell-ref">Ref</span>
                  {!quote && <span className="mo-cell-qty">Qty</span>}
                  {!quote && <span className="mo-cell-unit">Unit</span>}
                  <span className="mo-cell-note">Note</span>
                  <span className="mo-cell-x no-print" />
                </div>

                {g.entries.map((e) => (
                  <LineRow
                    key={e.materialId}
                    orderId={id}
                    entry={e}
                    quote={quote}
                    onRemove={() => remove(e.materialId)}
                    disabled={pending}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* --- Delivery + notes + delete (not printed). Each is its own stacked,
          full-width section (Tess, 2026-08-26: "make notes it's own section in the
          quote / order form"), with room for the several lines they usually hold. */}
      <div className="mo-meta no-print">
        <section className="mo-metasec">
          <span className="mat-label">Ship to</span>
          <textarea
            className="textarea"
            rows={3}
            value={ship}
            placeholder={`Delivery address for this ${noun}`}
            onChange={(e) => setShip(e.target.value)}
            onBlur={saveShip}
          />
        </section>
        <section className="mo-metasec">
          <span className="mat-label">{quote ? "Quote notes" : "Order notes"}</span>
          <textarea
            className="textarea"
            rows={5}
            value={note}
            placeholder="Anything the supplier should know — one point per line"
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
          />
        </section>
        <div className="mo-danger">
          <button
            type="button"
            className={"btn link" + (armDelete ? " arm" : "")}
            disabled={pending}
            onMouseLeave={() => setArmDelete(false)}
            onClick={() => (armDelete ? doDelete() : setArmDelete(true))}
          >
            {armDelete ? `Delete ${noun}?` : `Delete ${noun}`}
          </button>
        </div>
      </div>

      {adding && (
        <AddMaterials
          pickable={pickable}
          onClose={() => setAdding(false)}
          onAdd={addChosen}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// One line — the material and what this order asks for. Quantity, unit and note
// save on blur (unit on change); remove is a two-click arm.
function LineRow({
  orderId,
  entry,
  quote,
  onRemove,
  disabled,
}: {
  orderId: string;
  entry: Order["groups"][number]["entries"][number];
  quote: boolean;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [qty, setQty] = useState(entry.qty ?? "");
  const [unit, setUnit] = useState(entry.unit ?? "");
  const [note, setNote] = useState(entry.note ?? "");
  const [arm, setArm] = useState(false);
  useEffect(() => setQty(entry.qty ?? ""), [entry.qty]);
  useEffect(() => setUnit(entry.unit ?? ""), [entry.unit]);
  useEffect(() => setNote(entry.note ?? ""), [entry.note]);

  function save(patch: { qty?: string; unit?: string; note?: string }) {
    setOrderLine(orderId, entry.materialId, patch);
  }

  return (
    <div className="mo-row">
      <div className="mo-line mo-line-data">
      <span className="mo-cell-img">
        {entry.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.thumb} alt={entry.name} loading="lazy" />
        ) : (
          <span className="mo-noimg" />
        )}
      </span>
      <span className="mo-cell-name">
        <span className="mo-name-line">{entry.name}</span>
      </span>
      <span className="mo-cell-ref">{entry.supplierRef || "—"}</span>
      {/* Quantity and unit are the two columns a quote drops — it asks a supplier
          to price the materials, so the numbers come back, they don't go out. */}
      {!quote && (
        <span className="mo-cell-qty">
          <input
            className="input sm mo-qty-input no-print"
            value={qty}
            inputMode="decimal"
            placeholder="—"
            disabled={disabled}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => qty !== (entry.qty ?? "") && save({ qty })}
          />
          <span className="mo-print-val print-only">{qty || "—"}</span>
        </span>
      )}
      {!quote && (
        <span className="mo-cell-unit">
          <Select
            className="select sm mo-unit-input no-print"
            aria-label="Unit"
            value={unit}
            onChange={(v) => {
              setUnit(v);
              save({ unit: v });
            }}
            options={[
              { value: "", label: "—" },
              ...ORDER_UNITS.map((u) => ({ value: u, label: u })),
              ...(unit && !ORDER_UNITS.includes(unit as (typeof ORDER_UNITS)[number])
                ? [{ value: unit, label: unit }]
                : []),
            ]}
          />
          <span className="mo-print-val print-only">{unit || ""}</span>
        </span>
      )}
      <span className="mo-cell-note">
        <input
          className="input sm no-print"
          value={note}
          placeholder="—"
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (entry.note ?? "") && save({ note })}
        />
        {/* In print the note carries its own small "Notes" label (Tess,
            2026-08-26: "add small notes title in front of the notes for item"),
            like the spec facts, so a note far down a page reads without hunting
            for the column header. Nothing prints when the line has no note. */}
        {note && (
          <span className="mo-note-print print-only">
            <span className="mo-fact-k">Notes</span>
            {note}
          </span>
        )}
      </span>
      <span className="mo-cell-x no-print">
        <button
          type="button"
          className={"btn link sm" + (arm ? " arm" : "")}
          disabled={disabled}
          title="Remove line"
          onMouseLeave={() => setArm(false)}
          onClick={() => (arm ? onRemove() : setArm(true))}
        >
          {arm ? "Remove?" : "✕"}
        </button>
      </span>
      </div>

      {/* The full profile spec on its own full-width row, indented under the name:
          an aligned label/value grid so every field is easy to scan, with Notes
          given the whole width since it runs long (Tess, 2026-08-20: "organize the
          product details / notes in a clear and logical way"). */}
      {(entry.details.length > 0 || entry.aiFile) && (
        <div className="mo-detail">
          {entry.details.length > 0 && (
            <div className="mo-facts">
              {entry.details.map((d) => (
                <div
                  className={"mo-fact" + (d.label === "Notes" ? " mo-fact-wide" : "")}
                  key={d.label}
                >
                  <span className="mo-fact-k">{d.label}</span>
                  <span className="mo-fact-v">{d.value}</span>
                </div>
              ))}
            </div>
          )}
          {entry.aiFile && (
            <div className="mo-fact mo-fact-wide mo-ai-row">
              <span className="mo-fact-k">AI file</span>
              <a className="mo-ai no-print" href={entry.aiFile} target="_blank" rel="noreferrer">
                Open AI file ↗
              </a>
              {/* Printed as the bare URL so it can be copied off the PDF / email. */}
              <span className="mo-ai-print print-only">{entry.aiFile}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The add-materials picker — the whole library, searchable, filtered by kind,
// with the ones already on the order shown checked and disabled. Modelled on the
// linesheet's add-styles list.
function AddMaterials({
  pickable,
  onClose,
  onAdd,
}: {
  pickable: PickMaterial[];
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "fabric" | "trim" | "packaging">("all");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return pickable.filter((m) => {
      if (kind !== "all" && m.kind !== kind) return false;
      if (!query) return true;
      const hay = `${m.name} ${m.supplier ?? ""} ${m.spec}`.toLowerCase();
      return query.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [pickable, q, kind]);

  function toggle(m: PickMaterial) {
    if (m.inOrder) return;
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
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
      <div className="modal mat-modal">
        <div className="modal-head">
          <span>Add materials</span>
          <button className="notes-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="pg-filters" style={{ marginTop: 0 }}>
            {(["all", "fabric", "trim", "packaging"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={"pg-filter" + (kind === k ? " on" : "")}
                onClick={() => setKind(k)}
              >
                {k === "all" ? "All" : k === "fabric" ? "Fabrics" : k === "trim" ? "Trims" : "Packaging"}
              </button>
            ))}
          </div>
          <input
            className="input mo-pick-search"
            placeholder="Search materials — name, composition, supplier…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />

          {shown.length === 0 ? (
            <div className="empty">No materials match.</div>
          ) : (
            <div className="mo-pick-list">
              {shown.map((m) => {
                const on = chosen.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={"mo-pick" + (on ? " on" : "") + (m.inOrder ? " in" : "")}
                    onClick={() => toggle(m)}
                    disabled={m.inOrder}
                  >
                    <span className="mo-pick-check">{m.inOrder ? "✓" : on ? "✓" : ""}</span>
                    <span className="mo-pick-img">
                      {m.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.thumb} alt={m.name} loading="lazy" />
                      ) : (
                        <span className="mo-noimg" />
                      )}
                    </span>
                    <span className="mo-pick-body">
                      <span className="mo-pick-name">{m.name}</span>
                      {(m.spec || m.supplier) && (
                        <span className="mo-pick-spec">{m.spec || m.supplier}</span>
                      )}
                    </span>
                    {m.inOrder && <span className="mo-pick-tag">On order</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mat-tools">
            <button
              type="button"
              className="btn"
              disabled={chosen.size === 0}
              onClick={() => onAdd(Array.from(chosen))}
            >
              Add {chosen.size > 0 ? chosen.size : ""}
            </button>
            <button type="button" className="ph-link" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
