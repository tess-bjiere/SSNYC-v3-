"use client";

import { useState } from "react";
import Select from "@/app/components/Select";
import { FRED_CATEGORIES, fredTypesFor } from "@/lib/fredStyleNumber";

// FRED's Category → Type on the edit form, matching the create form (Tess,
// 2026-08-20: propagate the taxonomy). Type's options follow the chosen Category.
// Category posts as `category`, Type as `garment` (the column keeps its name). A
// stored value that predates the taxonomy still shows on the control — the custom
// Select renders the current value even when it is off the list — so editing an
// unrelated field never drops it.
export default function FredCategoryType({
  category: initialCategory = "",
  type: initialType = "",
}: {
  category?: string;
  type?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [type, setType] = useState(initialType);
  const types = fredTypesFor(category);

  function onCategory(v: string) {
    setCategory(v);
    setType(""); // the Type list changes with the family
  }

  return (
    <>
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
    </>
  );
}
