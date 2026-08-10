"use client";

import Select from "@/app/components/Select";
import { useTransition } from "react";
import { STYLE_STATUSES, STYLE_STATUS_LABELS, styleStatusLabel, type StyleStatus } from "@/lib/types";
import { setStatus, setEvergreen, setInLibrary } from "@/app/actions/styles";

// Status and evergreen, as one control (P3 refinements).
//
// This used to be four buttons in a row printing the raw database values —
// "inspo", "development", "production", "archived" — which meant the one place
// in the tool where you SET the stage looked nothing like the places where you
// pick anything else, and read as lowercase code. It is now the same dropdown
// as every other dropdown, with the labels people actually say.
//
// Evergreen sits next to it rather than being buried in Edit details, because
// it is a decision of the same size and it was previously only reachable by
// opening a form and saving the whole thing. It is a box, hard-cornered, and it
// is either filled or it is not — a checkbox rounds off and disappears at this
// size, and this flag is the difference between a style that gets remade every
// season and one that does not.
//
// Both write on change, with no Save button: there is one field each, and a
// dropdown you have to confirm is a dropdown people leave half-set.
export default function StatusControl({
  styleId,
  status,
  evergreen,
  libraryAt = null,
}: {
  styleId: string;
  status: string;
  evergreen: boolean;
  /** styles.library_at — when it was shelved, or null. */
  libraryAt?: string | null;
}) {
  const [pending, start] = useTransition();

  const known = (STYLE_STATUSES as readonly string[]).includes(status);
  const inLibrary = Boolean(libraryAt);

  return (
    <div className="statusctl">
      <Select
        className="select"
        value={status}
        disabled={pending}
        aria-label="Status"
        onChange={(v) => {
          const next = v as StyleStatus;
          if (next === status) return;
          start(async () => {
            await setStatus(styleId, next);
          });
        }}
        options={[
          ...STYLE_STATUSES.map((s) => ({ value: s as string, label: STYLE_STATUS_LABELS[s] })),
          // A value the list no longer defines still shows itself rather than
          // silently displaying as something else.
          ...(known ? [] : [{ value: status, label: styleStatusLabel(status) }]),
        ]}
      />

      <button
        type="button"
        className={"everbox" + (evergreen ? " on" : "")}
        aria-pressed={evergreen}
        disabled={pending}
        title={
          evergreen
            ? "Carried season to season. Click to unset."
            : "Mark as carried season to season."
        }
        onClick={() =>
          start(async () => {
            await setEvergreen(styleId, !evergreen);
          })
        }
      >
        <span className="box" aria-hidden />
        <span className="l">Evergreen</span>
      </button>

      {/* Tess, 2026-08-06: "style library should only have finished styles that
          have been submitted to style library". Submitting is this box. It sits
          under Evergreen because the two are asked in the same breath about a
          finished garment — is it worth keeping, and is it worth remaking — and
          because putting it here means the decision is made where the style is,
          not from a list where you cannot see it.

          Same box as Evergreen deliberately: it is a flag of the same size, and
          a second shape for the same kind of yes would only make you look
          twice. Unticking it is not destructive — it writes null and the style
          leaves one page — so it does not get the two-click arming that real
          deletion does. */}
      <button
        type="button"
        className={"everbox" + (inLibrary ? " on" : "")}
        aria-pressed={inLibrary}
        disabled={pending}
        title={
          inLibrary
            ? "On the Style Library shelf. Click to take it off."
            : "Submit this style to the Style Library."
        }
        onClick={() =>
          start(async () => {
            await setInLibrary(styleId, !inLibrary);
          })
        }
      >
        <span className="box" aria-hidden />
        <span className="l">Style Library</span>
      </button>
    </div>
  );
}
