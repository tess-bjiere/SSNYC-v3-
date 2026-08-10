"use client";

import { useState } from "react";
import Select from "@/app/components/Select";
import { STYLE_GARMENTS } from "@/lib/types";

// The garment picker, with an "Other…" escape (Tess, 2026-08-09: "add other for
// garment picklist"). Tess asked whether garment should just be free text; the
// answer this component takes is no. Free-typing garment reintroduces the drift
// that moving category to a picklist just removed — "Tee", "T-shirt" and "tee"
// would become three garments, and any grouping or filter on garment would
// fragment. So the common types come from STYLE_GARMENTS and Other carries the
// long tail: consistency where it is cheap, a way through where the list falls
// short.
//
// A garment already on a row that is not in the list — a legacy free-text value,
// or one retired from the list later — opens straight into Other with its text
// kept, so an existing garment is never lost or snapped to a nearby-but-wrong
// option.

const OTHER = "__other__";

export default function GarmentField({ defaultValue = "" }: { defaultValue?: string }) {
  const known = (STYLE_GARMENTS as readonly string[]).includes(defaultValue);
  // Empty → unset; a known garment → that option; anything else → Other, and the
  // old text is carried into the box rather than dropped.
  const [choice, setChoice] = useState(defaultValue === "" ? "" : known ? defaultValue : OTHER);
  const [custom, setCustom] = useState(known || defaultValue === "" ? "" : defaultValue);

  const isOther = choice === OTHER;
  // The single value the surrounding server-action form reads under `garment`.
  const posted = isOther ? custom.trim() : choice;

  return (
    <>
      <Select
        className="select"
        aria-label="Garment"
        value={choice}
        onChange={setChoice}
        options={[
          { value: "", label: "—" },
          ...STYLE_GARMENTS.map((g) => ({ value: g, label: g })),
          // Last, and named as an action rather than a garment, so it reads as
          // the way out of the list rather than a type of its own.
          { value: OTHER, label: "Other…" },
        ]}
      />
      {isOther && (
        <input
          className="input"
          type="text"
          aria-label="Garment (other)"
          placeholder="Type the garment"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ marginTop: 8 }}
          autoFocus
        />
      )}
      {/* Real hidden input, so the form posts exactly one `garment` value whether
          it came from the list or the Other box. */}
      <input type="hidden" name="garment" value={posted} />
    </>
  );
}
