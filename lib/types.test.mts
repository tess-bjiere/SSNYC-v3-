// The two label helpers added with the round's status and location lists.
//
// Both exist for the same reason and both have the same one job that matters:
// a value stored before the list existed has to keep reading back exactly as it
// was typed. The whole point of putting options on these fields was to stop new
// free text, not to erase the old.

import test from "node:test";
import assert from "node:assert/strict";

import {
  SAMPLE_LOCATIONS,
  SAMPLE_LOCATION_LABELS,
  SAMPLE_STATUSES,
  SAMPLE_STATUS_LABELS,
  SAMPLE_RATINGS,
  SAMPLE_RATING_LABELS,
  sampleLocationLabel,
  sampleRatingLabel,
  sampleStatusLabel,
  sampleStatusText,
  styleStatusLabel,
} from "./types.ts";

test("the round's status list runs in the order a sample moves through it", () => {
  assert.deepEqual(
    [...SAMPLE_STATUSES],
    [
      "needs to fit",
      "fitting scheduled",
      "with designer",
      "notes sent to factory",
      "approved minor notes",
      "approved",
      "on hold",
      "not moving forward",
    ]
  );
  // The four original values are unchanged as VALUES — only the order and one
  // caption moved — so no round stored before today needs rewriting.
  for (const v of ["needs to fit", "notes sent to factory", "with designer", "not moving forward"]) {
    assert.ok((SAMPLE_STATUSES as readonly string[]).includes(v), `${v} was dropped`);
  }
  // The hole this filled: there was no way to say a sample was fine — and then
  // that yes split in two, because "approved with minor notes" and "approved
  // with no notes" mean different things to whoever decides on another round.
  assert.ok((SAMPLE_STATUSES as readonly string[]).includes("approved"));
  assert.equal(SAMPLE_STATUS_LABELS.approved, "Approved with no notes");
  assert.equal(SAMPLE_STATUS_LABELS["approved minor notes"], "Approved with minor notes");
  assert.equal(SAMPLE_STATUS_LABELS["with designer"], "With designer for edits");
  // On hold is a decision about the calendar; not moving forward is a decision
  // about the style. Folding them together loses whether it is coming back.
  assert.ok((SAMPLE_STATUSES as readonly string[]).includes("on hold"));

  // The style's own status is a different field with a different list. If this
  // ever starts failing, the round list has been put on the style by mistake.
  assert.equal(styleStatusLabel("development"), "Sampling");
  assert.equal(styleStatusLabel("archived"), "Archived");
});

test("a known status reads as a sentence, an unknown one reads as itself", () => {
  for (const v of SAMPLE_STATUSES) {
    assert.equal(sampleStatusLabel(v), SAMPLE_STATUS_LABELS[v]);
  }
  // Everything typed into the free-text box this field used to be.
  assert.equal(sampleStatusLabel("fit ok"), "fit ok");
  assert.equal(sampleStatusLabel("fit off — lengthen body"), "fit off — lengthen body");
  assert.equal(sampleStatusLabel("  in progress  "), "in progress");
});

test("no status at all is nothing, not a dash or the word null", () => {
  assert.equal(sampleStatusLabel(null), "");
  assert.equal(sampleStatusLabel(undefined), "");
  assert.equal(sampleStatusLabel("   "), "");
});

test("the six places a sample goes, and anywhere else it actually went", () => {
  // "In transit" is last on purpose: it is the state, not a place, and the
  // five real destinations should stay together at the top of the list.
  assert.deepEqual(
    [...SAMPLE_LOCATIONS],
    ["office", "factory", "photographer", "pr", "sent to talent", "in transit"]
  );
  for (const v of SAMPLE_LOCATIONS) {
    assert.equal(sampleLocationLabel(v), SAMPLE_LOCATION_LABELS[v]);
  }
  // "pr" is an abbreviation, not a word — it must not come back "Pr".
  assert.equal(sampleLocationLabel("pr"), "PR");
  // The custom answer is stored verbatim, which is the point of storing the
  // place rather than the word "custom".
  assert.equal(sampleLocationLabel("Toni's studio, Queens"), "Toni's studio, Queens");
  assert.equal(sampleLocationLabel(null), "");
});

// How the sample came out — good / workable / poor. Same rules as the two
// lists above, plus one of its own: unrated has to stay a real state, because
// the card draws no chip at all for it and a helper that invented a word would
// put a colour on every round nobody has looked at yet.
test("the rating list is the three Tess asked for, in that order", () => {
  assert.deepEqual([...SAMPLE_RATINGS], ["good", "workable", "poor"]);
});

test("a known rating reads as a word, an unknown one reads as itself", () => {
  for (const v of SAMPLE_RATINGS) {
    assert.equal(sampleRatingLabel(v), SAMPLE_RATING_LABELS[v]);
  }
  assert.equal(sampleRatingLabel("needs a re-cut"), "needs a re-cut");
  assert.equal(sampleRatingLabel("  good  "), "Good");
});

test("no rating at all is nothing — not a dash, not a default of good", () => {
  assert.equal(sampleRatingLabel(null), "");
  assert.equal(sampleRatingLabel(undefined), "");
  assert.equal(sampleRatingLabel("   "), "");
});

// --- the fitting date -------------------------------------------------------

const fmt = (d: string) => (d === "2026-08-12" ? "12 Aug 26" : d);

test("a scheduled fitting reads as the whole sentence Tess asked for", () => {
  // Tess, 2026-08-07: "Fitting scheduled for (date)".
  assert.equal(sampleStatusText("fitting scheduled", "2026-08-12", fmt), "Fitting scheduled for 12 Aug 26");
});

test("a booked fitting with no date yet does not trail off mid-sentence", () => {
  // "Fitting scheduled for" with nothing after it looks like a bug; the missing
  // date is the person's to add, not this function's to apologise for.
  assert.equal(sampleStatusText("fitting scheduled", null, fmt), "Fitting scheduled");
  assert.equal(sampleStatusText("fitting scheduled", "   ", fmt), "Fitting scheduled");
});

test("no other status borrows the date, even when one is set", () => {
  // A date left behind from an earlier state must not rewrite a later one.
  assert.equal(sampleStatusText("with designer", "2026-08-12", fmt), "With designer for edits");
  assert.equal(sampleStatusText("approved", "2026-08-12", fmt), "Approved with no notes");
});

test("a status typed before the list existed still reads as itself", () => {
  assert.equal(sampleStatusText("fit ok", null, fmt), "fit ok");
  assert.equal(sampleStatusText(null, "2026-08-12", fmt), "");
});
