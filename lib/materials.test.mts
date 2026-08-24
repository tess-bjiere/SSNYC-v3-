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
  sourcingOf,
  sourcingLabel,
  constructionClass,
  kindLabelPlural,
  materialFacts,
} from "./materials.ts";

// The order sheet carries the whole profile, so materialFacts must list every
// filled field in display order, skip the blanks, append sourcing and the
// SUPPLIER-facing note, and leave out the columns the order already shows (Tess,
// 2026-08-20: "orders should include all the profile details from the profile
// that have been filled in").
test("materialFacts lists filled fields in order, drops blanks, adds sourcing + supplier note", () => {
  const facts = materialFacts({
    kind: "fabric",
    composition: "100% Cotton",
    color: "Ecru",
    weight: "220",
    width: "", // blank — must not appear
    price: "$6.50",
    sourcing: "custom",
    notes: "Duties 9-18%. Ordered via Jason.", // internal — must NOT appear
    supplier_notes: "Milled in Portugal",
  });
  assert.deepEqual(facts, [
    { label: "Weight (GSM)", value: "220" },
    { label: "Composition", value: "100% Cotton" },
    { label: "Colour", value: "Ecru" },
    { label: "Price", value: "$6.50" },
    { label: "Sourcing", value: "Custom" },
    { label: "Spec / instructions", value: "Milled in Portugal" },
  ]);
});

// The whole point of the split (Tess, 2026-08-23: "split internal from
// supplier-facing"). Internal notes used to ride along on every purchase order
// because materialFacts appended them and each CALL SITE had to remember to opt
// out — app/(app)/material-orders/[id]/page.tsx never did, so duty percentages
// and supplier contact emails printed on the PDFs sent to suppliers. materialFacts
// no longer knows about `notes` at all: the exclusion is structural, so no future
// call site can reintroduce the leak by forgetting a skip key.
test("materialFacts NEVER emits internal notes, even unskipped and fully populated", () => {
  const facts = materialFacts({
    kind: "fabric",
    composition: "100% Cotton",
    notes: "Duties: 9% to 18%. Ordered from jason.boyles@actonfabrics.com",
  });
  assert.deepEqual(facts, [{ label: "Composition", value: "100% Cotton" }]);
  assert.equal(
    facts.some((f) => f.value.includes("Duties") || f.value.includes("@")),
    false,
  );
});

test("materialFacts emits supplier_notes and can still be skipped by key", () => {
  const m = { kind: "packaging", supplier_notes: "1C printed BLACK + DEBOSSED" };
  assert.deepEqual(materialFacts(m), [
    { label: "Spec / instructions", value: "1C printed BLACK + DEBOSSED" },
  ]);
  assert.deepEqual(materialFacts(m, ["supplier_notes"]), []);
});

// matchMaterial documents itself as searching "every field that carries words",
// and the supplier-facing note carries plenty — hole counts, print methods,
// spacing. Someone hunting "deboss" should find the hangtag.
test("matchMaterial searches the supplier-facing note too", () => {
  const m = { kind: "packaging", name: "Hangtag", supplier_notes: "1C printed BLACK + DEBOSSED" };
  assert.equal(matchMaterial(m, "debossed"), true);
  assert.equal(matchMaterial(m, "hangtag debossed"), true);
  assert.equal(matchMaterial(m, "embroidered"), false);
});

test("materialFacts drops a blank or whitespace-only supplier note", () => {
  assert.deepEqual(materialFacts({ kind: "fabric", supplier_notes: "   " }), []);
  assert.deepEqual(materialFacts({ kind: "fabric" }), []);
});

test("materialFacts omits the keys the order shows elsewhere", () => {
  const facts = materialFacts(
    { kind: "trim", supplier: "YKK", supplier_ref: "Z-12", material: "Corozo", ai_file: "http://x/a.ai" },
    ["supplier", "supplier_ref", "ai_file"]
  );
  assert.deepEqual(facts, [{ label: "Material", value: "Corozo" }]);
});

test("kindOf defaults to fabric unless the row explicitly says trim or packaging", () => {
  assert.equal(kindOf({}), "fabric");
  assert.equal(kindOf({ kind: "fabric" }), "fabric");
  assert.equal(kindOf({ kind: "trim" }), "trim");
  assert.equal(kindOf({ kind: "packaging" }), "packaging");
  assert.equal(kindOf({ kind: "junk" }), "fabric");
});

test("kindLabelPlural spells packaging out rather than adding an -s", () => {
  assert.equal(kindLabelPlural("fabric"), "Fabrics");
  assert.equal(kindLabelPlural("trim"), "Trims");
  assert.equal(kindLabelPlural("packaging"), "Packaging");
});

test("fieldsFor shows kind-specific fields first, then the shared set", () => {
  const fab = fieldsFor("fabric").map((f) => f.key);
  const trim = fieldsFor("trim").map((f) => f.key);
  const pack = fieldsFor("packaging").map((f) => f.key);
  assert.equal(fab[0], "weight"); // fabric-specific leads
  assert.equal(trim[0], "trim_type"); // trim-specific leads
  assert.equal(pack[0], "pack_type"); // packaging-specific leads
  assert.ok(fab.includes("supplier") && trim.includes("supplier") && pack.includes("supplier"));
  assert.ok(!fab.includes("trim_type")); // no cross-contamination
  assert.ok(!trim.includes("weight"));
  assert.ok(!pack.includes("trim_type") && !pack.includes("weight"));
  // Background/print colour belong to a printed trim or hangtag, not a fabric
  // (Tess, 2026-08-20: "add background colour and print colour ... on packaging
  // and trims").
  assert.ok(trim.includes("background_color") && trim.includes("print_color"));
  assert.ok(pack.includes("background_color") && pack.includes("print_color"));
  assert.ok(!fab.includes("background_color") && !fab.includes("print_color"));
});

test("specLine for packaging reads material · cost · supplier", () => {
  assert.equal(
    specLine({ kind: "packaging", material: "Recycled LDPE", price: "$0.08", supplier: "PacRite" }),
    "Recycled LDPE · $0.08 · PacRite"
  );
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

test("sourcingOf only recognizes stock or custom, else empty", () => {
  assert.equal(sourcingOf({ sourcing: "custom" }), "custom");
  assert.equal(sourcingOf({ sourcing: "stock" }), "stock");
  assert.equal(sourcingOf({ sourcing: "" }), "");
  assert.equal(sourcingOf({ sourcing: "whatever" }), "");
  assert.equal(sourcingOf({}), "");
  assert.equal(sourcingLabel(sourcingOf({ sourcing: "custom" })), "Custom");
  assert.equal(sourcingLabel(""), "");
});

test("matchMaterial searches the custom/stock flag", () => {
  assert.ok(matchMaterial({ name: "Rib", sourcing: "custom" }, "custom"));
  assert.ok(!matchMaterial({ name: "Rib", sourcing: "stock" }, "custom"));
});

test("constructionClass reads knit vs woven from construction text", () => {
  assert.equal(constructionClass({ construction: "Knit" }), "Knit");
  assert.equal(constructionClass({ construction: "Single Jersey" }), "Knit");
  assert.equal(constructionClass({ construction: "2x2 Rib" }), "Knit");
  assert.equal(constructionClass({ construction: "Woven" }), "Woven");
  assert.equal(constructionClass({ construction: "Cotton Twill" }), "Woven");
  assert.equal(constructionClass({ construction: "Poplin" }), "Woven");
  assert.equal(constructionClass({ construction: "" }), "Other");
  assert.equal(constructionClass({}), "Other");
});
