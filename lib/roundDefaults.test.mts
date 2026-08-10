import test from "node:test";
import assert from "node:assert/strict";
import { nextRoundDefaults } from "./roundDefaults.ts";

test("the six standing facts carry from the round the style is on", () => {
  const d = nextRoundDefaults({
    factory: "Jiaxing",
    contact_name: "Ana",
    contact_email: "ana@jiaxing.example",
    material_type: "Nylon",
    material_contents: "100% nylon",
    material_supplier: "Toray",
  });
  assert.equal(d.factory, "Jiaxing");
  assert.equal(d.contact_name, "Ana");
  assert.equal(d.contact_email, "ana@jiaxing.example");
  assert.equal(d.material_type, "Nylon");
  assert.equal(d.material_contents, "100% nylon");
  assert.equal(d.material_supplier, "Toray");
});

test("nothing about how the last round went comes with it", () => {
  // The excluded fields are excluded by not existing on the returned shape at
  // all, which is what stops one being added back by accident later.
  const d = nextRoundDefaults({ factory: "Jiaxing" }) as Record<string, unknown>;
  for (const k of [
    "status",
    "rating",
    "location",
    "submitted_date",
    "received_date",
    "eta_date",
    "fit_notes",
    "comments",
    "material_notes",
    "tracking_number",
  ]) {
    assert.equal(k in d, false, `${k} must not carry to a new round`);
  }
});

test("the first round of a style falls back to the style's own factory", () => {
  const d = nextRoundDefaults(null, "Jiaxing");
  assert.equal(d.factory, "Jiaxing");
  assert.equal(d.contact_name, "");
  assert.equal(d.material_type, "");
});

test("a round made at a second factory offers that factory, not the style's", () => {
  const d = nextRoundDefaults({ factory: "Maxime" }, "Jiaxing");
  assert.equal(d.factory, "Maxime");
});

test("a round with no factory of its own still offers the style's", () => {
  assert.equal(nextRoundDefaults({ factory: "   " }, "Jiaxing").factory, "Jiaxing");
  assert.equal(nextRoundDefaults({}, "Jiaxing").factory, "Jiaxing");
});

test("nulls and stray whitespace come back as empty strings, never null", () => {
  const d = nextRoundDefaults({
    factory: null,
    contact_name: "  Ana  ",
    contact_email: null,
    material_type: undefined,
    material_contents: "  ",
    material_supplier: null,
  });
  assert.equal(d.factory, "");
  assert.equal(d.contact_name, "Ana");
  assert.equal(d.contact_email, "");
  assert.equal(d.material_type, "");
  assert.equal(d.material_contents, "");
  assert.equal(d.material_supplier, "");
});

test("no previous round and no style factory is an empty form, not a crash", () => {
  const d = nextRoundDefaults(undefined);
  assert.equal(d.factory, "");
  assert.equal(d.contact_email, "");
});
