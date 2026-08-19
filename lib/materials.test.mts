import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fieldsFor,
  kindOf,
  specLine,
  matchMaterial,
  distinct,
  materialGarments,
  usedForProduct,
  gsmLabel,
} from "./materials.ts";

test("kindOf defaults to fabric unless the row explicitly says trim", () => {
  assert.equal(kindOf({}), "fabric");
  assert.equal(kindOf({ kind: "fabric" }), "fabric");
  assert.equal(kindOf({ kind: "trim" }), "trim");
  assert.equal(kindOf({ kind: "junk" }), "fabric");
});

test("fieldsFor shows kind-specific fields first, then the shared set", () => {
  const fab = fieldsFor("fabric").map((f) => f.key);
  const trim = fieldsFor("trim").map((f) => f.key);
  assert.equal(fab[0], "weight"); // fabric-specific leads
  assert.equal(trim[0], "trim_type"); // trim-specific leads
  assert.ok(fab.includes("supplier") && trim.includes("supplier")); // shared in both
  assert.ok(!fab.includes("trim_type")); // no cross-contamination
  assert.ok(!trim.includes("weight"));
});

test("specLine is contents, cost, supplier — and ignores the specs it used to carry", () => {
  assert.equal(
    specLine({
      kind: "fabric",
      composition: "100% Linen",
      price: "$8.40/m",
      supplier: "Albini (Italy)",
      // Both of these used to be on the line and must not come back.
      weight: "200 GSM",
      width: "1.5 m",
    }),
    "100% Linen · $8.40/m · Albini (Italy)"
  );
});

test("specLine reads contents from material on a trim, not composition", () => {
  assert.equal(
    specLine({ kind: "trim", material: "Corozo", price: "$0.35", supplier: "YKK", trim_type: "Button", size: "18L" }),
    "Corozo · $0.35 · YKK"
  );
});

test("specLine closes up rather than leaving a stray separator when a fact is missing", () => {
  assert.equal(
    specLine({ kind: "fabric", composition: "100% Cotton", price: "", supplier: "Vilartex (Portugal)" }),
    "100% Cotton · Vilartex (Portugal)"
  );
  assert.equal(specLine({ kind: "fabric", composition: "100% Cotton" }), "100% Cotton");
  assert.equal(specLine({ kind: "fabric" }), "");
});

test("specLine trims whitespace so a space-only field does not become a separator", () => {
  assert.equal(
    specLine({ kind: "fabric", composition: "100% Wool", price: "   ", supplier: "Loro Piana" }),
    "100% Wool · Loro Piana"
  );
});

test("matchMaterial requires every term to appear somewhere (AND search)", () => {
  const m = { name: "Washed Linen", composition: "100% Linen", supplier: "Albini", weight: "200 GSM" };
  assert.ok(matchMaterial(m, ""));
  assert.ok(matchMaterial(m, "linen"));
  assert.ok(matchMaterial(m, "linen 200")); // across fields
  assert.ok(matchMaterial(m, "albini washed"));
  assert.ok(!matchMaterial(m, "linen wool")); // one term missing → no match
});

test("distinct returns sorted, de-duped, non-empty values for a filter", () => {
  const list = [
    { supplier: "Albini" },
    { supplier: "" },
    { supplier: "Albini" },
    { supplier: "Brunello" },
    { supplier: null },
  ];
  assert.deepEqual(distinct(list, "supplier"), ["Albini", "Brunello"]);
});

// A material can serve many products; the list reads cleanly whatever the jsonb
// holds.
test("materialGarments normalizes the products array", () => {
  assert.deepEqual(materialGarments({ garments: ["Tee", "Boxer", "Tee", " ", "Oxford"] }), [
    "Tee",
    "Boxer",
    "Oxford",
  ]);
  assert.deepEqual(materialGarments({ garments: [] }), []);
  assert.deepEqual(materialGarments({}), []);
  assert.deepEqual(materialGarments({ garments: "Tee" as unknown }), []); // not an array
});

test("usedForProduct matches a product case-insensitively", () => {
  const m = { garments: ["Monogram Sock", "Crew Sock"] };
  assert.ok(usedForProduct(m, "crew sock"));
  assert.ok(usedForProduct(m, "Monogram Sock"));
  assert.ok(!usedForProduct(m, "Boxer"));
});

test("matchMaterial also searches the products a material is used for", () => {
  const m = { name: "Rib Jersey", composition: "Cotton", garments: ["Crew Sock", "Boxer"] };
  assert.ok(matchMaterial(m, "sock")); // matches a product, not a spec field
  assert.ok(matchMaterial(m, "cotton boxer")); // one spec term, one product term
});

test("gsmLabel appends GSM to a bare number and leaves a unit alone", () => {
  assert.equal(gsmLabel("220"), "220 GSM");
  assert.equal(gsmLabel("220 gsm"), "220 gsm");
  assert.equal(gsmLabel("6 oz"), "6 oz");
  assert.equal(gsmLabel(""), "");
  assert.equal(gsmLabel(null), "");
});
