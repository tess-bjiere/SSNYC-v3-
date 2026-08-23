"use client";

import { useState } from "react";
import Select from "@/app/components/Select";
import { suggestFredNumber, fredCodeFor, fredTypesFor, FRED_CATEGORIES } from "@/lib/fredStyleNumber";

// FRED's category → type → style number, coordinated (Tess, 2026-08-20: auto-
// generate the number, "garment level refinement", and a Type field that isn't
// called "garment" because Home and Body have none; then "i want it to auto
// populate the style number once the category and type are filled out").
//
// The number field FILLS with the generated number as soon as the category (and
// then type) are chosen, and updates as they change — until you type your own,
// after which it is left alone. Clearing the field re-arms the auto-fill. Category
// posts as `category`, Type as `garment` (the column keeps its name). A category
// with no code leaves the field for you to fill. If the field is somehow left
// blank, createStyle still assigns the next number at save.
export default function FredStyleNumberFields({
  existing,
}: {
  /** Every FRED style number already in use, so the fill reads the next one. */
  existing: string[];
}) {
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [styleNo, setStyleNo] = useState("");
  const [edited, setEdited] = useState(false);

  const types = fredTypesFor(category);

  // Refill the number from the current category + type, unless the user has taken
  // the field over by typing.
  function refill(cat: string, t: string) {
    if (edited) return;
    setStyleNo(suggestFredNumber(existing, cat, t) ?? "");
  }
  function onCategory(v: string) {
    setCategory(v);
    setType(""); // the Type list changes with the family
    refill(v, "");
  }
  function onType(v: string) {
    setType(v);
    refill(category, v);
  }
  function onStyleNo(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setStyleNo(v);
    // Typing takes the field over; clearing it hands control back to the auto-fill.
    setEdited(v.trim() !== "");
  }

  const code = fredCodeFor(category, type);
  const hint = !category
    ? "Pick a category and type — the number fills in automatically."
    : !code
      ? "No code for this category yet — enter a number."
      : edited
        ? "Using your number. Clear the field to auto-generate it again."
        : `Auto-generated from category${type ? " & type" : ""} — edit to override.`;

  return (
    <div className="row3">
      <div className="field">
        <label>Style number</label>
        <input
          className="input"
          name="style_no"
          value={styleNo}
          placeholder="FR-…"
          onChange={onStyleNo}
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
          onChange={onType}
          disabled={types.length === 0}
          placeholder={category ? "—" : "Pick a category first"}
          options={[{ value: "", label: "—" }, ...types.map((t) => ({ value: t.label, label: t.label }))]}
        />
      </div>
    </div>
  );
}
