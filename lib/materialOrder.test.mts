import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeItems,
  addItems,
  removeItem,
  setItemField,
  buildOrder,
  normalizeStatus,
  orderSummary,
  NO_SUPPLIER_LABEL,
  type OrderEntryInput,
} from "./materialOrder.ts";

// A material appears at most once, in the order added — a purchase order asks for
// each material one time, with one quantity.
test("normalizeItems keeps order and drops duplicates and junk", () => {
  const raw = [
    { material_id: "a", qty: "10", unit: "m" },
    { material_id: "b" },
    { material_id: "a", qty: "99" }, // duplicate — the first wins
    { qty: "5" }, // no id — dropped
    null,
    "nope",
  ];
  const items = normalizeItems(raw);
  assert.deepEqual(
    items.map((i) => i.material_id),
    ["a", "b"]
  );
  assert.equal(items[0].qty, "10");
  assert.equal(items[0].unit, "m");
});

test("normalizeItems returns [] for non-arrays", () => {
  assert.deepEqual(normalizeItems(null), []);
  assert.deepEqual(normalizeItems(undefined), []);
  assert.deepEqual(normalizeItems({}), []);
});

// Adding materials appends the new ones and does NOT reset an existing line's
// quantity — re-adding a material already on the order is a no-op.
test("addItems appends new ids and leaves existing lines untouched", () => {
  const items = [{ material_id: "a", qty: "10" }];
  const next = addItems(items, ["a", "b", "b", "c"]);
  assert.deepEqual(
    next.map((i) => i.material_id),
    ["a", "b", "c"]
  );
  assert.equal(next[0].qty, "10"); // not reset
});

test("removeItem drops just that material", () => {
  const items = [{ material_id: "a" }, { material_id: "b" }];
  assert.deepEqual(
    removeItem(items, "a").map((i) => i.material_id),
    ["b"]
  );
});

// A line's quantity/unit/note edit in place; an empty value clears the field.
test("setItemField sets and clears fields, others untouched", () => {
  const items = [{ material_id: "a", qty: "10", unit: "m" }, { material_id: "b" }];
  const q = setItemField(items, "a", { qty: "25" });
  assert.equal(q[0].qty, "25");
  assert.equal(q[0].unit, "m"); // untouched
  const cleared = setItemField(items, "a", { qty: "" });
  assert.equal(cleared[0].qty, undefined);
  // A material not on the order is a no-op.
  assert.deepEqual(setItemField(items, "zzz", { qty: "5" }), items);
});

function entry(id: string, supplier: string | null): OrderEntryInput {
  return {
    materialId: id,
    name: id.toUpperCase(),
    kind: "fabric",
    supplier,
    supplierRef: null,
    composition: null,
    color: null,
    price: null,
    moq: null,
    leadTime: null,
    thumb: null,
    qty: null,
    unit: null,
    note: null,
  };
}

// The heart of the feature: lines group by supplier, suppliers sort A→Z, and the
// no-supplier bucket is always last so it reads as the leftovers.
test("buildOrder groups by supplier, no-supplier bucket last", () => {
  const inputs = [
    entry("a", "Zephyr Mills"),
    entry("b", "Alba Trims"),
    entry("c", null),
    entry("d", "Alba Trims"),
  ];
  const order = buildOrder({ name: "FW26", status: "draft" }, inputs);
  assert.deepEqual(
    order.groups.map((g) => g.supplier),
    ["Alba Trims", "Zephyr Mills", NO_SUPPLIER_LABEL]
  );
  // Line order preserved within a supplier.
  assert.deepEqual(
    order.groups[0].entries.map((e) => e.materialId),
    ["b", "d"]
  );
  assert.equal(order.groups[2].unassigned, true);
  assert.equal(order.count, 4);
  assert.equal(order.supplierCount, 3);
});

// A material deleted since it was added simply never reaches buildOrder — the
// page filters it out — so an order with one unresolved line is smaller, never
// broken. (Modelled by passing only the resolved inputs.)
test("buildOrder counts only the inputs it is given", () => {
  const order = buildOrder({ name: "x", status: "sent" }, [entry("a", "Mill")]);
  assert.equal(order.count, 1);
  assert.equal(order.statusLabel, "Sent");
});

test("normalizeStatus falls back to draft for anything unknown", () => {
  assert.equal(normalizeStatus("sent"), "sent");
  assert.equal(normalizeStatus("received"), "received");
  assert.equal(normalizeStatus("draft"), "draft");
  assert.equal(normalizeStatus("garbage"), "draft");
  assert.equal(normalizeStatus(null), "draft");
});

test("orderSummary reads naturally at the edges", () => {
  assert.equal(orderSummary(0, 0), "Empty");
  assert.equal(orderSummary(1, 1), "1 line · 1 supplier");
  assert.equal(orderSummary(3, 2), "3 lines · 2 suppliers");
});
