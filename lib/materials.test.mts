import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fieldsFor,
  kindOf,
  specLine,
  matchMaterial,
  distinct,
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

test("specLine reads the right facts per kind and skips blanks", () => {
  assert.equal(
    specLine({ kind: "fabric", composition: "100% Linen", weight: "200 GSM", width: "", supplier: "Albini" }),
    "100% Linen · 200 GSM · Albini"
  );
  assert.equal(
    specLine({ kind: "trim", trim_type: "Button", material: "Corozo", size: "18L", supplier: "" }),
    "Button · Corozo · 18L"
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
