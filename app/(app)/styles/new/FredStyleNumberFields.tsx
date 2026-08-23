"use client";

import { useState } from "react";
import Select from "@/app/components/Select";
import { suggestFredNumber, fredCodeForCategory } from "@/lib/fredStyleNumber";

// FRED auto-generates a style number from the category (Tess, 2026-08-20: "i want
// fred to auto generate style numbers based on our rules, the user would have the
// ability to edit if needed"). This pairs the Category select with the Style
// number field so the number can preview live as the category changes.
//
// The number field is left EMPTY unless the user types an override. A blank field
// means "use the rule" — the server assigns the true next number in the code at
// save time (see createStyle), so what lands is never a stale suggestion from a
// form that sat open. The live preview here shows what that will be; typing a
// number overrides it. Categories with no allocation (Dresses, Activewear) get no
// suggestion and the user simply types one.
export default function FredStyleNumberFields({
  existing,
  categories,
}: {
  /** Every FRED style number already in use, so the preview reads the next one. */
  existing: string[];
  categories: readonly string[];
}) {
  const [category, setCategory] = useState("");
  const [override, setOverride] = useState("");

  const code = fredCodeForCategory(category);
  const suggestion = suggestFredNumber(existing, category);

  const hint = !category
    ? "Pick a category and FRED assigns the next number in its code."
    : !code
      ? "No auto-number for this category yet — type one if you need it."
      : override.trim()
        ? `Using your number. Auto would be ${suggestion ?? "—"} — clear the field to use it.`
        : `Will be assigned ${suggestion ?? "—"} — type to override.`;

  return (
    <div className="row">
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
          onChange={setCategory}
          options={[{ value: "", label: "—" }, ...categories.map((c) => ({ value: c, label: c }))]}
        />
      </div>
    </div>
  );
}
