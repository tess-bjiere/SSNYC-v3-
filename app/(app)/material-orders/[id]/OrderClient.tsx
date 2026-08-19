"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Select from "@/app/components/Select";
import { ORDER_STATUSES, ORDER_UNITS, type Order } from "@/lib/materialOrder";
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
  kind: "fabric" | "trim";
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
  order,
  shipTo,
  notes,
  pickable,
  cover,
}: {
  id: string;
  order: Order;
  shipTo: string;
  notes: string;
  pickable: PickMaterial[];
  cover: { brandLogo: string | null; brandLabel: string; generatedOn: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

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
  const fileTitle = `${name} — material order`;
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
      router.push("/material-orders");
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
    <div className="page mo-page">
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
              Purchase order · {order.statusLabel} · {cover.generatedOn}
            </div>
          </div>
        </div>

        {empty ? (
          <div className="empty no-print">
            No materials on this order yet. Use “+ Add materials”, or select materials in the
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

              {/* Ship-to and notes ride once per supplier page in print so each
                  sent page is a complete PO. On screen they render once, below. */}
              <div className="mo-lines">
                {/* Header row (screen + print). */}
                <div className="mo-line mo-line-head">
                  <span className="mo-cell-img" />
                  <span className="mo-cell-name">Material</span>
                  <span className="mo-cell-ref">Ref</span>
                  <span className="mo-cell-qty">Qty</span>
                  <span className="mo-cell-unit">Unit</span>
                  <span className="mo-cell-note">Note</span>
                  <span className="mo-cell-x no-print" />
                </div>

                {g.entries.map((e) => (
                  <LineRow
                    key={e.materialId}
                    orderId={id}
                    entry={e}
                    onRemove={() => remove(e.materialId)}
                    disabled={pending}
                  />
                ))}
              </div>

              {(ship.trim() || note.trim()) && (
                <div className="mo-group-foot print-only">
                  {ship.trim() && (
                    <div className="mo-foot-line">
                      <span className="mo-foot-k">Ship to</span>
                      <span>{ship}</span>
                    </div>
                  )}
                  {note.trim() && (
                    <div className="mo-foot-line">
                      <span className="mo-foot-k">Notes</span>
                      <span>{note}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          ))
        )}
      </div>

      {/* --- Delivery + notes + delete (not printed) --- */}
      <div className="mo-meta no-print">
        <label className="mat-field mat-field-wide">
          <span className="mat-label">Ship to</span>
          <textarea
            className="textarea"
            rows={2}
            value={ship}
            placeholder="Delivery address for this order"
            onChange={(e) => setShip(e.target.value)}
            onBlur={saveShip}
          />
        </label>
        <label className="mat-field mat-field-wide">
          <span className="mat-label">Order notes</span>
          <textarea
            className="textarea"
            rows={2}
            value={note}
            placeholder="Anything the supplier should know"
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
          />
        </label>
        <div className="mo-danger">
          <button
            type="button"
            className={"btn link" + (armDelete ? " arm" : "")}
            disabled={pending}
            onMouseLeave={() => setArmDelete(false)}
            onClick={() => (armDelete ? doDelete() : setArmDelete(true))}
          >
            {armDelete ? "Delete order?" : "Delete order"}
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
  onRemove,
  disabled,
}: {
  orderId: string;
  entry: Order["groups"][number]["entries"][number];
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

  const spec = [entry.composition, entry.color].filter(Boolean).join(" · ");

  return (
    <div className="mo-line">
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
        {spec && <span className="mo-spec">{spec}</span>}
      </span>
      <span className="mo-cell-ref">{entry.supplierRef || "—"}</span>
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
      <span className="mo-cell-note">
        <input
          className="input sm no-print"
          value={note}
          placeholder="—"
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (entry.note ?? "") && save({ note })}
        />
        <span className="mo-print-val print-only">{note || ""}</span>
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
  const [kind, setKind] = useState<"all" | "fabric" | "trim">("all");
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal mat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Add materials</span>
          <button className="notes-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="pg-filters" style={{ marginTop: 0 }}>
            {(["all", "fabric", "trim"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={"pg-filter" + (kind === k ? " on" : "")}
                onClick={() => setKind(k)}
              >
                {k === "all" ? "All" : k === "fabric" ? "Fabrics" : "Trims"}
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
