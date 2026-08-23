"use client";

import { useState } from "react";
import Select from "@/app/components/Select";
import { suggestFredNumber, fredCodeFor, fredTypesFor, FRED_CATEGORIES } from "@/lib/fredStyleNumber";

// FRED's category → type → style number, coordinated (Tess, 2026-08-20: auto-
// generate the number, "garment level refinement", and a Type field that isn't
// called "garment" because Home and Body have none). Category picks the family,
// Type refines to the two-digit code, and the number previews live off both.
//
// The number field is left EMPTY unless the user types an override — a blank means
// "use the rule", so the server assigns the true next number in the code at save
// (see createStyle), never a stale suggestion from a form left open. Category posts
// as `category`; Type posts as `garment` (the column keeps its name, only the label
// changed). A category with no Type yet numbers into its family anchor.
export default function FredStyleNumberFields({
  existing,
}: {
  /** Every FRED style number already in use, so the preview reads the next one. */
  existing: string[];
}) {
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [override, setOverride] = useState("");

  const types = fredTypesFor(category);
  const code = fredCodeFor(category, type);
  const suggestion = suggestFredNumber(existing, category, type);

  function onCategory(v: string) {
    setCategory(v);
    setType(""); // the Type list changes with the family
  }

  const hint = !category
    ? "Pick a category and FRED assigns the next number in its code."
    : !code
      ? "No auto-number for this category yet — type one if you need it."
      : override.trim()
        ? `Using your number. Auto would be ${suggestion ?? "—"} — clear the field to use it.`
        : `Will be assigned ${suggestion ?? "—"}${type ? "" : " — pick a type to refine the code"}.`;

  return (
    <div className="row3">
      <div className="field">
        <label>Style number</label>
        <input
          className="input"
          name="style_no"
          value={override}
          placeholder={suggestion ?? "FR-…"}
          onChange={(e) => setOverride(e.target.value)}
        />
        <div className="field-hint">{hint}</div>
      </div>
      <div className="field">
        <label>Category</label>
        <Select
          className="select"
          name="category"
          aria-label="Category"
          value={category}
          onChange={onCategory}
          options={[{ value: "", label: "—" }, ...FRED_CATEGORIES.map((c) => ({ value: c, label: c }))]}
        />
      </div>
      <div className="field">
        <label>Type</label>
        <Select
          className="select"
          name="garment"
          aria-label="Type"
          value={type}
          onChange={setType}
          disabled={types.length === 0}
          placeholder={category ? "—" : "Pick a category first"}
          options={[{ value: "", label: "—" }, ...types.map((t) => ({ value: t.label, label: t.label }))]}
        />
      </div>
    </div>
  );
}
