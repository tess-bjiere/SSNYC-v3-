"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CloseOnSave from "@/app/components/CloseOnSave";
import NotesField from "@/app/components/NotesField";
import Select from "@/app/components/Select";
import Link from "next/link";
import {
  SAMPLE_ROUNDS,
  SAMPLE_ROUND_LABELS,
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
  type SampleLocation,
  type SampleRating,
  type SampleRound,
  type SampleStatus,
  type StyleSample,
} from "@/lib/types";
import { PHOTO_SLOTS, normalizePhotos, photoProgressLabel, type PhotoMap } from "@/lib/photoSlots";
import { nextRoundDefaults } from "@/lib/roundDefaults";
import {
  sampleState,
  SAMPLE_STATE_LABELS,
  materialStatus,
  materialLeadDays,
  factoryLeadDays,
  materialSummary,
  hasLegacyMaterialDates,
  sampleEta,
  sampleTimeline,
  shortDate,
  sortSamples,
  latestSample,
} from "@/lib/sampleCycle";
import { readImages, SHOTS_KEY, type ListImage } from "@/lib/imageList";
import { readNotes, EMPTY_NOTE, type ImageNote } from "@/lib/imageNotes";
import { addSample, updateSample, setSampleMaterials, addSampleShot, addComment } from "@/app/actions/styles";
import ImageStrip from "./ImageStrip";
import SlotCards from "./SlotCards";
import PhotoSlots from "./PhotoSlots";
import ImageNotes from "./ImageNotes";
import Linked from "@/app/components/Linked";
import { requestCommentScope } from "./commentScope";
import { PHOTO_FOCUS_EVENT, peekPhotoFocus } from "./photoFocus";
import {
  normalizeMaterialIds,
  resolveMaterials,
  splitByKind,
  type LinkedMaterial,
} from "@/lib/sampleMaterials";

// The sample rounds (P3 #40, refined).
//
// Called "Sample rounds", not "Sample cycle" (Tess, 2026-08-05: "instead of
// sample cycle say sample round"). The unit of work in the studio is the
// round — a proto, an SMS, a PPS — and that is the word everyone already uses
// in conversation. "Cycle" was the app's word for a thing nobody called that.
// The module lib/sampleCycle.ts keeps its filename: it is not copy, and
// renaming a file that half the app imports buys nothing a reader can see.
//
// A round is a small timeline with two legs: the raw material reaching the
// factory, then the factory making and returning the sample. Keeping them apart
// is the whole point — a round that ran late because the fabric was late looks
// nothing like a round the factory sat on, and before this they looked identical.
//
// What the refinement changed, and why:
//
//   material is described, not dated
//       Type and contents are two fields because two different people ask for
//       them: "Cotton jersey" answers the designer, "94% cotton, 6% elastane"
//       answers the factory and the paperwork. The four material date pickers
//       are gone — nobody filled them in, and a date nobody fills in is worse
//       than a sentence somebody does. Anything already typed into them still
//       shows, marked as history; see the note below.
//
//   "Submitted"/"Received" became "Sample submitted"/"Sample received"
//   (and "Sample submitted" became "Sample requested" on 2026-08-05 — the date
//   is when we asked the factory for it, which is the day the clock the studio
//   actually counts against starts. The column is still submitted_date.)
//       Next to a material leg that also submits and receives things, one-word
//       labels were a guess.
//
//   an ETA, but only while it is missing
//       Offered until the sample is in, then it stops being a question. This is
//       the field Xander and the C-level actually read, and it is the one thing
//       from a round that earns space on a development thumbnail.
//
//   shots on the round
//       Photographs of what arrived, attached to the round rather than the
//       style, so the 1st proto's shots sit with the 1st proto. That is the
//       difference between a folder of pictures and a record of what changed.
//       The strip moved above the notes on 2026-08-04 because it had been
//       below all three note blocks and Tess never saw it ("option to add
//       addtional photos into the sample round as well" — the feature existed,
//       the placement hid it). On 2026-08-05 she moved it back: "all notes
//       should live above photos in sample section." That is not a reversal of
//       the fix, it is what the fix was actually for. The strip was invisible
//       in August because it sat under three paragraphs AND under nothing else
//       — now the five photography slots and the strip are one block with a
//       legend on it, and the notes above them are three short lines rather
//       than the whole card. Prose first, and it reads that way: what the round
//       IS, then what it looks like.
//
//   the photography standard, per round
//       The five shoot slots — model front and back, lay flat front and back,
//       detail — are filled on the round, not on the style (Tess, 2026-08-05:
//       "photography should not be it's own section, it needs to live within
//       the specific sample round"). A lay flat is a photograph of one garment
//       that one factory made on one round; filing it on the style meant the
//       PPS silently overwrote the proto and the studio lost the ability to see
//       what changed between them. Now the 1st proto keeps its own five, and
//       the comparison the whole tool exists for is just scrolling.
//
//   the latest round is the page, the rest are behind a click
//       Tess, 2026-08-05: "when someone opens the profile the latest sample
//       round should be showing. all other rounds would be viewable on clicking
//       into previous samples." A style late in the season had six full cards
//       stacked down the page and the one that mattered — the one with work
//       outstanding on it — was the one furthest from the top. The current
//       round is now the section; the history is one line under it.
//
//   comments per round
//       Each card carries its own comment count, and clicking it points the
//       drawer at that round. Feedback on the 2nd proto is about the 2nd proto,
//       not about the style in general, and it should be readable from the card
//       it belongs to.
//
// Everything shown is computed in lib/sampleCycle.ts, which is pure and
// unit-tested; this file only lays it out. `today` comes down from the server so
// "late" is decided once, server-side, and cannot drift between renders.

function Field({
  label,
  name,
  defaultValue,
  type,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

// The round's status, as a list rather than a text box (Tess, 2026-08-05:
// "status options should be: needs to fit, notes sent to factory, with
// designer, not moving forward").
//
// This is the round's status, not the style's — see SAMPLE_STATUSES in
// lib/types.ts for why that reading was taken. Until now it was the only
// status in the tool with no options at all: a free-text box with the
// placeholder "e.g. fit ok", which meant "fit ok", "Fit OK", "fits" and "ok on
// fit" were four different statuses as far as anything counting them knew.
//
// Anything already typed into that box is kept and stays selected: it is not
// in the standard list, so it is added as an extra option at the bottom and
// reads back verbatim. Nobody's round quietly changes status because the field
// grew a dropdown. Same pattern as the Round select above.
function StatusField({
  value,
  fittingDate,
}: {
  value?: string | null;
  fittingDate?: string | null;
}) {
  const cur = (value ?? "").trim();
  const known = SAMPLE_STATUSES.includes(cur as SampleStatus);
  return (
    <div className="field">
      {/* "Fitting status", not "Status" (Tess, 2026-08-05: "rethink status
          under sample round -- maybe it should say fitting status?"). She is
          right, and the reason is that this card already had two things called
          status: the chip in the head, which is where the sample is in the
          post — requested, in transit, arrived — and this, which is where the
          garment is in the fitting loop: needs to fit, notes sent to factory,
          with designer, not moving forward. One word for two questions is why
          the card had to be read twice. The stored values are untouched; only
          the caption changed. */}
      <label>Fitting status</label>
      <Select
        className="select"
        name="status"
        defaultValue={cur}
        options={[
          { value: "", label: "—" },
          ...SAMPLE_STATUSES.map((v) => ({ value: v, label: SAMPLE_STATUS_LABELS[v] })),
          // A status typed before this list existed keeps its own row, so
          // opening the box does not quietly re-answer the question.
          ...(cur && !known ? [{ value: cur, label: cur }] : []),
        ]}
      />
      {/* The date the fitting is booked for (Tess, 2026-08-07: "Fitting
          scheduled for (date)").

          Always rendered, never revealed by picking the status — same rule as
          the tracking number beside the location. A field that unmounts stops
          posting, and a field that stops posting blanks its column on the next
          save, so a date set on Monday would disappear the moment somebody
          moved the round on to With designer. It is dim and captioned until the
          status makes it relevant, which is enough. */}
      <label className="field-sub" htmlFor={undefined}>
        <span>Fitting date</span>
        <input
          className="input sm"
          type="date"
          name="fitting_date"
          defaultValue={(fittingDate ?? "").slice(0, 10)}
        />
      </label>
      {/* "Date notes sent" removed from the form (Tess, 2026-08-24 field audit —
          rarely filled). sampleFields no longer writes notes_sent_date, so any
          date already on a round is left exactly as it was; only the input is
          gone. Put it back by restoring this block and the column in sampleFields. */}
    </div>
  );
}

// How the sample came out (Tess, 2026-08-05: "add a rating to each sample round
// as good - green, workable - yellow, poor - red").
//
// Three buttons rather than a dropdown, and that is the whole feature. A rating
// is the one field on this card that is meant to be answered in the second
// after somebody puts the garment down, and a select costs two clicks and a
// read of four options to say a thing that has three answers. The colours are
// on the control itself, so the act of rating looks like the thing it produces.
//
// "Not rated" is an option in the row, not a missing state you have to guess
// at, because clearing a rating has to be as easy as giving one — a sample
// judged poor in the morning and fixed by the afternoon should not need a
// developer.
//
// Radios, not buttons with state: one name, one value, no javascript needed for
// the form to post correctly, and the browser's own keyboard handling for a
// group of three.
function RatingField({ value, name }: { value?: string | null; name: string }) {
  const cur = (value ?? "").trim();
  const known = !cur || SAMPLE_RATINGS.includes(cur as SampleRating);
  return (
    <div className="field">
      <label>How it came out</label>
      <div className="rate-row" role="radiogroup" aria-label="How the sample came out">
        <label className="rate rate-none">
          <input type="radio" name={name} value="" defaultChecked={!cur} />
          <span>Not rated</span>
        </label>
        {SAMPLE_RATINGS.map((r) => (
          <label className={"rate rate-" + r} key={r}>
            <input type="radio" name={name} value={r} defaultChecked={cur === r} />
            <span>{SAMPLE_RATING_LABELS[r]}</span>
          </label>
        ))}
        {/* A value stored before this list existed keeps its place in the row
            and stays selected, exactly as the status and location fields do.
            The point of adding options is to stop new free text, not to erase
            what is already written down. */}
        {cur && !known && (
          <label className="rate">
            <input type="radio" name={name} value={cur} defaultChecked />
            <span>{cur}</span>
          </label>
        )}
      </div>
    </div>
  );
}

// Where the garment physically is (Tess, 2026-08-05: "add 'current sample
// location' into sample rounds. options would be office, factory,
// photographer, pr, sent to talent, custom").
//
// "Custom" is a way of answering, not an answer, so it is never what gets
// stored. Choosing it opens a text box and the box is what posts — the column
// ends up holding "Toni's studio", not the word "custom", which means the
// value is readable in an export, groupable in a list, and never needs a
// second field to explain itself.
//
// The select carries no name; a hidden input does. That way exactly one
// `location` field exists in the form at any moment, whichever mode it is in,
// and the server action stays a single line that neither knows nor cares which
// control the answer came from.
const CUSTOM = "__custom";
function LocationField({ value }: { value?: string | null }) {
  const cur = (value ?? "").trim();
  const known = !cur || SAMPLE_LOCATIONS.includes(cur as SampleLocation);
  const [choice, setChoice] = useState(known ? cur : CUSTOM);
  const [custom, setCustom] = useState(known ? "" : cur);

  return (
    <div className="field">
      <label>Current sample location</label>
      <Select
        className="select"
        aria-label="Location"
        value={choice}
        onChange={setChoice}
        options={[
          { value: "", label: "—" },
          ...SAMPLE_LOCATIONS.map((v) => ({ value: v, label: SAMPLE_LOCATION_LABELS[v] })),
          { value: CUSTOM, label: "Custom…" },
        ]}
      />
      {choice === CUSTOM ? (
        <input
          className="input"
          name="location"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Where is it?"
          style={{ marginTop: 6 }}
        />
      ) : (
        <input type="hidden" name="location" value={choice} />
      )}
    </div>
  );
}

// Tracking number was a per-round field (Tess, 2026-08-06: "add a place for
// tracking number"); removed from the form 2026-08-24 (field audit — rarely
// filled). sampleFields no longer writes tracking_number, so any number already on
// a round is preserved and still shown read-only on the card; only the input is
// gone. Restore by putting this component back, its two call sites, and the column
// in sampleFields.

// One material, as it reads on a round — the library's own shorthand, so a chip
// here and a row there say the same thing about the same cloth.
function MaterialChip({ m }: { m: LinkedMaterial }) {
  const under = [m.composition, m.supplier].filter(Boolean).join(" · ");
  return (
    <span className={`sr-mat${m.deleted ? " is-retired" : ""}`}>
      {m.color_hex ? (
        <i className="sr-mat-dot" style={{ background: m.color_hex }} aria-hidden="true" />
      ) : null}
      <span className="sr-mat-name">{m.name}</span>
      {under ? <span className="sr-mat-sub">{under}</span> : null}
      {/* A material retired from the library after this round was made in it.
          Worth saying, because the chip otherwise reads as current stock. */}
      {m.deleted ? <span className="sr-mat-flag">retired</span> : null}
    </span>
  );
}

// The picker. Native checkboxes named material_ids, so the whole selection
// posts itself and readMaterialIds(form.getAll("material_ids")) is the only
// thing that has to understand it — no state to fall out of sync with the form.
//
// Only rendered when there IS a library: on SSYNC the materials table has never
// been applied and the library is hidden (db/p11-materials.sql), so SOUS SOUS
// and Renggli see the words-only form exactly as before.
function MaterialPicker({
  library,
  selected,
}: {
  library: readonly LinkedMaterial[];
  selected: readonly string[];
}) {
  const chosen = new Set(selected);
  // A retired material stays offered only if THIS round already links it —
  // history is kept, but the list of things you can newly pick is current.
  // Packaging is not tracked per sample round — it belongs to the style, not to
  // what one sample was sewn in (Tess, 2026-08-20: "no need to include packaging
  // on each sample round"). So the round picker offers fabrics and trims only.
  const offer = library.filter((m) => (!m.deleted || chosen.has(m.id)) && m.kind !== "packaging");
  if (!offer.length) return null;
  const { fabrics, trims } = splitByKind(offer);

  const group = (label: string, items: LinkedMaterial[]) =>
    items.length ? (
      <div className="sr-matpick-group">
        <div className="sr-matpick-label">{label}</div>
        <div className="sr-matpick-list">
          {items.map((m) => (
            <label key={m.id} className="sr-matpick-item">
              <input
                type="checkbox"
                name="material_ids"
                value={m.id}
                defaultChecked={chosen.has(m.id)}
              />
              <MaterialChip m={m} />
            </label>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="sr-matpick">
      <label className="sr-matpick-head">From the library</label>
      {group("Fabrics", fabrics)}
      {group("Trims", trims)}
    </div>
  );
}

// The material half of the form. Identical on add and edit so the two can never
// drift into asking for different things.
//
// The typed fields are the record for anything not in the library, and stay the
// record regardless: lib/sampleCycle.ts and both exports read them. The picker
// is additive (Tess, 2026-08-19: "on the sample profile -- we should be able to
// link the fabric and trims") and appears only where a library exists.
function MaterialFields({
  s,
  library = [],
}: {
  s?: Pick<StyleSample, "material_type" | "material_contents" | "material_supplier"> & {
    material_notes?: string | null;
    material_ids?: unknown;
  };
  library?: readonly LinkedMaterial[];
}) {
  return (
    <>
      <div className="sr-legend">Raw material</div>
      <MaterialPicker library={library} selected={normalizeMaterialIds(s?.material_ids)} />
      <div className="row3">
        <Field
          label="Type"
          name="material_type"
          defaultValue={s?.material_type ?? ""}
          placeholder="e.g. cotton jersey"
        />
        <Field
          label="Contents"
          name="material_contents"
          defaultValue={s?.material_contents ?? ""}
          placeholder="e.g. 94% cotton, 6% elastane"
        />
        <Field label="Supplier" name="material_supplier" defaultValue={s?.material_supplier ?? ""} />
      </div>
      <div className="field">
        <label>Material notes</label>
        <NotesField
          name="material_notes"
          defaultValue={s?.material_notes ?? ""}
          placeholder="Dates, lead times, dye lot, anything the next person needs."
        />
      </div>
    </>
  );
}

// Who at the factory this round is with (Tess, 2026-08-05: "Add contact for
// sample").
//
// Two fields, not one. The name is what the card shows, because the question it
// answers is "who do I chase about this proto" and that is asked out loud, by
// somebody who then picks up the phone. The address is only ever read by the
// export, to fill in the To line of a mail a person still has to press send on.
// A round with a name and no address is normal and completely fine.
//
// Nothing here is a contacts table. A factory contact changes, and when it does
// the truth is "this round was with Ana, the next one is with Marta" — which is
// exactly what a per-round field records and a shared contact record destroys.
// Typed by what it reads, not by where the values came from, so the same
// component serves a saved round and the defaults a new one opens with.
function ContactFields({ s }: { s?: Pick<StyleSample, "contact_name"> }) {
  return (
    <div className="row">
      <Field
        label="Contact"
        name="contact_name"
        defaultValue={s?.contact_name ?? ""}
        placeholder="who at the factory"
      />
      {/* Contact email removed from the form (Tess, 2026-08-24 field audit —
          rarely filled). sampleFields no longer writes contact_email, so an
          address already on a round is preserved; only the input is gone. */}
    </div>
  );
}

/**
 * Everything this round is, read-only.
 *
 * Pulled out of the card on 2026-08-05 so it has exactly one definition and
 * three places can show it: the card, the full-screen view, and — by its
 * absence — the card while it is being edited. Before this the full-screen view
 * would have been a second copy of the same twenty lines, and the two would
 * have drifted the first time a field was added to one of them.
 */
// Sub in an alternate fabric on a single sample round (Tess, 2026-08-20: "have
// the ability to sub in an alternate fabric on one of the samples"). A quick
// inline picker over the library's fabrics that writes just this round's
// material_ids — the round's trims and packaging are carried through untouched,
// only the fabric is swapped. FRED-only, like the rest of the materials library;
// off FRED there is no library and this renders nothing.
const isFabricKind = (m: LinkedMaterial) => m.kind !== "trim" && m.kind !== "packaging";

function SampleFabricSwap({
  styleId,
  sampleId,
  library,
  materialIds,
}: {
  styleId: string;
  sampleId: string;
  library: readonly LinkedMaterial[];
  materialIds: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  if (!library.length) return null;

  const byId = new Map(library.map((m) => [m.id, m]));
  // Everything on this round that is NOT a fabric stays; the fabric is what a
  // sub replaces. An id whose row is gone simply drops.
  const keep = materialIds.filter((id) => {
    const m = byId.get(id);
    return !!m && !isFabricKind(m);
  });
  const curFabricIds = materialIds.filter((id) => {
    const m = byId.get(id);
    return !!m && isFabricKind(m);
  });

  const query = q.trim().toLowerCase();
  const offer = library.filter(
    (m) =>
      isFabricKind(m) &&
      (!m.deleted || curFabricIds.includes(m.id)) &&
      !curFabricIds.includes(m.id) &&
      (!query ||
        `${m.name} ${m.composition ?? ""} ${m.supplier ?? ""}`.toLowerCase().includes(query)),
  );

  function sub(fabricId: string) {
    start(async () => {
      await setSampleMaterials(styleId, sampleId, [...keep, fabricId]);
      router.refresh();
      setOpen(false);
      setQ("");
    });
  }
  function clearFabric() {
    start(async () => {
      await setSampleMaterials(styleId, sampleId, keep);
      router.refresh();
      setOpen(false);
    });
  }

  const hasFabric = curFabricIds.length > 0;

  return (
    <div className="sr-fabswap">
      {open ? (
        <div className="sr-fabswap-picker">
          <div className="sr-fabswap-head">
            <input
              className="input"
              value={q}
              autoFocus
              placeholder="Search fabrics — name, composition, supplier"
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" className="btn link" onClick={() => { setOpen(false); setQ(""); }}>
              Done
            </button>
          </div>
          {offer.length === 0 ? (
            <div className="linkref-msg">
              {query ? "No fabric matches that." : "No other fabric in the library."}
            </div>
          ) : (
            <div className="sr-fabswap-list">
              {offer.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="stmat-offer"
                  disabled={pending}
                  onClick={() => sub(m.id)}
                >
                  <MaterialChip m={m} />
                  <span className="stmat-add">{hasFabric ? "Sub in" : "+ Add"}</span>
                </button>
              ))}
            </div>
          )}
          {hasFabric && (
            <button type="button" className="btn link sm" disabled={pending} onClick={clearFabric}>
              Remove fabric from this sample
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="btn link sm sr-fabswap-open"
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          {hasFabric ? "Sub in an alternate fabric" : "Add a fabric from the library"}
        </button>
      )}
    </div>
  );
}

function RoundFacts({
  s,
  today,
  styleId,
  library = [],
}: {
  s: StyleSample;
  today: string;
  styleId: string;
  library?: readonly LinkedMaterial[];
}) {
  const mat = materialStatus(s, today);
  const steps = sampleTimeline(s);
  const matLead = materialLeadDays(s);
  const facLead = factoryLeadDays(s);
  const matLine = materialSummary(s);
  // Resolved against the library rather than trusted: an id whose row is
  // genuinely gone renders as unlinked, not as a broken chip.
  const linked = resolveMaterials(
    normalizeMaterialIds((s as { material_ids?: unknown }).material_ids),
    library,
  );

  return (
    <>
      {/* Every fact on this card is a titled field: a small caption above the
          thing it names, and the thing under it. Tess, 2026-08-05: "clean this
          up so all have full title before the notes and spacing makes sense."

          What she was looking at had three different kinds of line on one card.
          "Nylon" and "in progress" sat bare, with nothing saying what they were
          — the fabric could as easily have been read as a note and the status
          as a comment. "FIT  OK" put its title inline, so the label and the
          answer ran together as one phrase. And "FACTORY LEG 9D" was all
          caption and no value, which made it read as a heading for the blank
          space under it. Only the two dates were built properly, and they were
          the only two lines on the card that could be read at a glance.

          So the dates won. One shape now — .sr-field, caption over value — for
          the fabric, the legs, the status and all three notes, on one rhythm.
          Titles are written out in full: "Material notes", not "Material". */}
      {(matLine || mat.state !== "none" || linked.length > 0 || library.length > 0) && (
        <div className="sr-field">
          <span className="k">Raw material</span>
          {matLine && <div className="v">{matLine}</div>}
          {/* What the round is linked to in the library, under what was typed.
              Both, deliberately: the words are the record for anything not in
              the library, and a link is the record for what is. */}
          {linked.length > 0 && (
            <div className="sr-mats">
              {linked.map((m) => (
                <MaterialChip key={m.id} m={m} />
              ))}
            </div>
          )}
          {mat.state !== "none" && <div className={"sr-material " + mat.state}>{mat.label}</div>}
          {/* Sub in an alternate fabric on just this sample, without opening the
              whole round form (Tess, 2026-08-20). FRED-only — renders nothing when
              there is no library. Trims/packaging on the round are left alone. */}
          <SampleFabricSwap
            styleId={styleId}
            sampleId={s.id}
            library={library}
            materialIds={normalizeMaterialIds((s as { material_ids?: unknown }).material_ids)}
          />
        </div>
      )}

      {/* The dates and the two legs on one row rather than a row and then a
          lonely line under it: they are the same kind of fact — how long this
          round has taken and where it got to — and they are read together. */}
      {(steps.length > 0 || matLead !== null || facLead !== null) && (
        <div className="sr-facts">
          {steps.map((st) => (
            <div className="sr-field" key={st.key}>
              <span className="k">{st.label}</span>
              <div className="v">{st.date}</div>
            </div>
          ))}
          {matLead !== null && (
            <div className="sr-field">
              <span className="k">Material leg</span>
              <div className="v">
                {matLead} {matLead === 1 ? "day" : "days"}
              </div>
            </div>
          )}
          {facLead !== null && (
            <div className="sr-field">
              <span className="k">Factory leg</span>
              <div className="v">
                {facLead} {facLead === 1 ? "day" : "days"}
              </div>
            </div>
          )}
        </div>
      )}

      {(s.status || s.location || s.tracking_number || s.contact_name) && (
        <div className="sr-facts">
          {s.status && (
            <div className="sr-field">
              <span className="k">Fitting status</span>
              <div className="v">{sampleStatusText(s.status, s.fitting_date, shortDate)}</div>
            </div>
          )}
          {/* Where the garment is. It sits next to the status because the two
              are asked in the same breath — "where is the SMS and what is
              happening with it" is one question, not two. */}
          {s.location && (
            <div className="sr-field">
              <span className="k">Current sample location</span>
              <div className="v">{sampleLocationLabel(s.location)}</div>
            </div>
          )}
          {/* Only when there is one. Unlike the tech pack this is not a
              question asked of every round — most rounds never ship by
              courier at all — so an em dash on all of them would be six
              blanks to earn one number. */}
          {s.tracking_number && (
            <div className="sr-field">
              <span className="k">Tracking number</span>
              <div className="v">{s.tracking_number}</div>
            </div>
          )}
          {/* The name only. The address is not printed on a page anybody can
              screenshot and forward — it does one job, in the export, where the
              person sending the mail is the person who typed it. */}
          {s.contact_name && (
            <div className="sr-field">
              <span className="k">Contact</span>
              <div className="v">{s.contact_name}</div>
            </div>
          )}
        </div>
      )}

      {/* Written notes first, photography under them (Tess, 2026-08-05: "all
          notes should live above photos in sample section"), and set off from
          the dates above by the same hairline that introduces the photography
          below — so the card reads in three bands: what this round is, what was
          said about it, what it looks like.

          Titles in full and above the text, not beside it. "FIT  OK" on one
          line reads as a phrase; a caption over a value reads as an answer to a
          question, which is what it is. Linked, not raw: a factory comment is
          as likely to be a Drive link as a sentence. */}
      {(s.material_notes || s.fit_notes || s.comments) && (
        <div className="sr-notes">
          {s.material_notes && (
            <div className="sr-field">
              <span className="k">Material notes</span>
              <div className="v">
                <Linked text={s.material_notes} block={false} />
              </div>
            </div>
          )}
          {s.fit_notes && (
            <div className="sr-field">
              <span className="k">Fit notes</span>
              <div className="v">
                <Linked text={s.fit_notes} block={false} />
              </div>
            </div>
          )}
          {s.comments && (
            <div className="sr-field">
              <span className="k">Factory comments that came with samples</span>
              <div className="v">
                <Linked text={s.comments} block={false} />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The round, editable — in the place the facts were, not underneath the
 * photographs.
 *
 * Tess, 2026-08-05: "when you edit the sample round, the fields should turn
 * editable and show the ones you haven't added, as opposed to making you scroll
 * down below photos."
 *
 * Two separate complaints in one sentence, and both are fixed here rather than
 * by moving one block:
 *
 *   Where. The form used to render after the photography, so pressing Edit at
 *   the top of a card scrolled the thing you pressed off the screen and put the
 *   fields below eleven photo slots and a strip. It now renders where the facts
 *   were — same position, same order of fields as the order the facts were read
 *   in — so Edit reads as the card turning editable, which is what it is.
 *
 *   What. Reading a card only shows the fields that have something in them; a
 *   round with no ETA has no ETA line. That is right for reading and useless
 *   for filling in, because the fields you have not got to yet are exactly the
 *   ones you opened the form for. So the form is complete: every field, always,
 *   empty ones included.
 *
 * The one deliberate exception is the ETA, which disappears once the sample has
 * landed — an arrival date and an estimate of the arrival date cannot both be
 * true, and the stored value is left untouched rather than blanked.
 */
function RoundForm({
  styleId,
  s,
  onDone,
  library = [],
}: {
  styleId: string;
  s: StyleSample;
  onDone: () => void;
  library?: readonly LinkedMaterial[];
}) {
  const legacyDates = hasLegacyMaterialDates(s);
  const landed = !!s.received_date;

  return (
    <form className="sr-form sr-form-inline" action={updateSample.bind(null, styleId, s.id)}>
      <div className="row3">
        <div className="field">
          <label>Round</label>
          <Select
            className="select"
            name="round"
            aria-label="Round"
            defaultValue={s.round}
            options={[
              ...SAMPLE_ROUNDS.map((r) => ({ value: r, label: SAMPLE_ROUND_LABELS[r] })),
              ...(SAMPLE_ROUNDS.includes(s.round as SampleRound)
                ? []
                : [{ value: s.round, label: s.round }]),
            ]}
          />
        </div>
        <Field label="Factory" name="factory" defaultValue={s.factory ?? ""} />
        <StatusField value={s.status} fittingDate={s.fitting_date} />
      </div>
      <div className="row3">
        <LocationField value={s.location} />
        {/* Tracking number removed from the form here (Tess, 2026-08-24 field
            audit); still shown read-only on the card when a round has one. */}
      </div>
      <div className="row3">
        <RatingField value={s.rating} name="rating" />
      </div>

      <ContactFields s={s} />

      <MaterialFields s={s} library={library} />

      <div className="sr-legend">Factory</div>
      <div className="row3">
        <Field
          label="Sample requested"
          name="submitted_date"
          type="date"
          defaultValue={s.submitted_date ?? ""}
        />
        <Field
          label="Sample received"
          name="received_date"
          type="date"
          defaultValue={s.received_date ?? ""}
        />
        {/* The ETA is a question only while the answer is unknown. Once the
            sample is in, the field disappears rather than sitting there
            contradicting the arrival date. The stored value is left alone. */}
        {landed ? (
          <div className="field" />
        ) : (
          <Field
            label="Sample ETA"
            name="eta_date"
            type="date"
            defaultValue={s.eta_date ?? ""}
          />
        )}
      </div>

      <div className="field">
        <label>Fit notes — how this round fitted</label>
        <NotesField name="fit_notes" defaultValue={s.fit_notes} />
      </div>
      <div className="field">
        <label>Factory comments that came with samples</label>
        <NotesField name="comments" defaultValue={s.comments} />
      </div>

      {/* Rounds logged before material went from dates to words still hold
          those dates. They are shown here, read-only, rather than deleted:
          nothing in this tool destroys something somebody typed because the
          form moved on. They keep appearing in the timeline above. */}
      {legacyDates && (
        <div className="sr-legacy">
          <span className="k">Material dates from before</span>
          {s.material_ordered_date && <span>Ordered {shortDate(s.material_ordered_date)}</span>}
          {s.material_eta_date && <span>Due {shortDate(s.material_eta_date)}</span>}
          {s.material_received_date && <span>In {shortDate(s.material_received_date)}</span>}
          <span className="h">Kept as history. Add anything new to Material notes.</span>
        </div>
      )}

      <div className="sr-form-actions">
        <button className="btn sm" type="submit">
          Save round
        </button>
        <button className="btn link" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      {/* Saving closes the form, exactly as Cancel does — but only once the
          action has come back (Tess, 2026-08-06: "if you click save on details
          or sample round it should save and close out box automatically"). */}
      <CloseOnSave onDone={onDone} />
    </form>
  );
}

/** Every picture on a round, in shoot order, with whatever is written on it. */
function roundImages(slotPhotos: PhotoMap, shots: ListImage[], notes: Record<string, ImageNote>) {
  const out: { url: string; label: string; note: ImageNote }[] = [];
  const seen = new Set<string>();
  const push = (url: string, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, label, note: notes[url] ?? EMPTY_NOTE });
  };
  // The standard first, in the order it is shot in, so the full-screen view of
  // any two rounds puts the same photograph in the same place — which is the
  // only reason a studio can compare them at a glance.
  for (const slot of PHOTO_SLOTS) push(slotPhotos[slot.id] ?? "", slot.label);
  for (const im of shots) push(im.url, im.caption || "Extra");
  return out;
}

/**
 * The round, full screen (Tess, 2026-08-05: "there should be a full screen view
 * of sample rounds on desktop that is easy for team to see images large and
 * clear with all notes super clear").
 *
 * This is the review screen: the thing you put on the big monitor when three
 * people are standing round it deciding whether the proto passes. It is mostly
 * for looking — nothing in here uploads or deletes a photograph — but the one
 * thing a fitting produces is notes, and Tess (2026-08-05) asked for them here:
 * "full screen view should allow user to make / edit notes". So clicking a
 * photograph opens the marking editor on it, at full size, with arrows to walk
 * the round without leaving the screen.
 *
 * It opens the EXISTING editor rather than growing a second one. Every mark and
 * caption is stored in the same jsonb map, written through lib/imageNotes.ts,
 * which preserves the keys it did not come for. A second editor would be a
 * second writer of that map, and two writers is how a studio loses a note.
 *
 * The notes ride WITH the pictures rather than in a block above them. A note
 * that says "hem is short" is unreadable three feet from the photograph it is
 * about, and the whole complaint being answered is that the notes were not
 * clear. Each photograph carries its caption and every mark written on it,
 * printed as text under the image — because a pin dot on a photograph is
 * findable when you are clicking and invisible when you are standing back.
 *
 * Escape closes. The backdrop closes. No native dialog anywhere — a confirm()
 * would freeze the page and there is nothing here worth confirming.
 */
/* A comment and its replies, filed against a round — the plain, serialisable
   shape the full-screen viewer needs. Built on the page from the same threads
   the drawer reads, filtered to this round's sample_id, so the two can never
   disagree about what has been said. */
export type FullComment = {
  id: string;
  author: string | null;
  body: string | null;
  created_at: string | null;
};
export type FullThread = { comment: FullComment; replies: FullComment[] };

function commentWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FullCommentLine({ c }: { c: FullComment }) {
  return (
    <>
      <div className="note-meta">
        <span className="note-by">{c.author || "Someone"}</span>
        <span className="note-when" suppressHydrationWarning>
          {commentWhen(c.created_at)}
        </span>
      </div>
      <Linked className="note-text" text={c.body} />
    </>
  );
}

/**
 * The round's comment thread, inside the full-screen viewer — read it, add to
 * it, reply to it, without leaving the review (Tess, 2026-08-24: "the ability
 * to add or respond to comments").
 *
 * The same style_comments the drawer writes, scoped to this round: a new
 * comment carries the round's sample_id, a reply carries only its parent_id and
 * inherits the scope server-side (see addComment). Editing and deleting are
 * deliberately left to the drawer — this panel is for the two things a fit
 * review actually needs, saying something new and answering something said.
 */
function RoundComments({
  styleId,
  sampleId,
  threads,
}: {
  styleId: string;
  sampleId: string;
  threads: FullThread[];
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);

  return (
    <div className="sr-full-comments">
      <div className="sr-legend">Comments</div>

      {threads.length === 0 && (
        <p className="sr-cmt-none">No comments on this round yet.</p>
      )}

      {threads.map((t) => (
        <div className="note" key={t.comment.id}>
          <FullCommentLine c={t.comment} />

          {t.replies.length > 0 && (
            <div className="note-replies">
              {t.replies.map((r) => (
                <div className="note-reply" key={r.id}>
                  <FullCommentLine c={r} />
                </div>
              ))}
            </div>
          )}

          {replyTo === t.comment.id ? (
            <form
              action={async (fd) => {
                await addComment(styleId, fd);
                setReplyTo(null);
              }}
              className="sr-cmt-form"
            >
              <input type="hidden" name="parent_id" value={t.comment.id} />
              <textarea
                className="textarea"
                name="body"
                placeholder="Reply…"
                autoFocus
                style={{ minHeight: 52 }}
              />
              <div className="sr-cmt-row">
                <button className="btn sm" type="submit">
                  Reply
                </button>
                <button
                  type="button"
                  className="note-act"
                  onClick={() => setReplyTo(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="note-act"
              onClick={() => setReplyTo(t.comment.id)}
            >
              Reply
            </button>
          )}
        </div>
      ))}

      {/* New comment on this round. The sample_id rides with it, so posting from
          this viewer files the comment against the round being reviewed — the
          same filing the drawer does when a round is picked. React resets the
          box on a successful action, so there is nothing to clear by hand. */}
      <form action={addComment.bind(null, styleId)} className="sr-cmt-form sr-cmt-add">
        <input type="hidden" name="sample_id" value={sampleId} />
        <textarea
          className="textarea"
          name="body"
          placeholder="Add a comment on this round…"
          required
          style={{ minHeight: 56 }}
        />
        <button className="btn sm" type="submit">
          Comment
        </button>
      </form>
    </div>
  );
}

function FullRound({
  styleId,
  styleName,
  styleNo,
  s,
  today,
  images,
  comments = [],
  onClose,
  library = [],
}: {
  styleId: string;
  styleName?: string | null;
  styleNo?: string | null;
  s: StyleSample;
  today: string;
  images: { url: string; label: string; note: ImageNote }[];
  comments?: FullThread[];
  onClose: () => void;
  library?: readonly LinkedMaterial[];
}) {
  const roundMeta = { name: styleName, styleNo, factory: s.factory, fitDate: s.fitting_date };
  /** Which photograph is being marked, by url. Null is the review screen. */
  const [editing, setEditing] = useState<string | null>(null);
  // Which fit comment to land on when that photograph opens — set when a fit
  // comment in the rail is clicked, so the viewer opens straight onto its reply
  // thread rather than the list (Tess, 2026-08-17: "reply to fit comments in
  // full screen view as well"). Cleared once the viewer has consumed it.
  const [focusPin, setFocusPin] = useState<string | null>(null);
  const at = editing === null ? -1 : images.findIndex((im) => im.url === editing);
  const open = at >= 0 ? images[at] : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // While a photograph is being marked, Escape belongs to the editor — it
      // clears a half-written mark, then closes the editor. Closing the whole
      // review screen out from under an unsaved note would be a data loss.
      if (e.key === "Escape" && editing === null) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  const label = SAMPLE_ROUND_LABELS[s.round as SampleRound] ?? s.round;

  return (
    <div className="modal-overlay sr-full-overlay">
      {/* No close-on-backdrop here either, and this one was worse than it
          looked: Escape is gated on `editing === null` so the marking editor
          keeps its own key, but the backdrop was not gated at all — a click
          into the dark while marking a photograph shut the whole viewer and
          took the marks with it. Close is the way out. */}
      <div className="modal sr-full" role="dialog" aria-modal="true" aria-label={`${label}, full screen`}>
        <div className="modal-head">
          <span>
            {label}
            {/* The same chip the card carries, in the same colour. It is here
                rather than in RoundFacts so the card does not print it twice —
                the card has it in its own head. */}
            {s.rating && <span className={"sr-rate " + s.rating}>{sampleRatingLabel(s.rating)}</span>}
            {s.factory && <span className="sr-full-factory">{s.factory}</span>}
          </span>
          <button type="button" className="btn link" onClick={onClose}>
            Close
          </button>
        </div>
        {/* Two columns, one screenful (Tess, 2026-08-05: "FULL VIEW of sample
            round notes should be full screen where all the info is viewable
            without vertically scrolling — column 1: details 25%, column 2:
            images in horizontal line full bleed with mark-ups, notes below").

            The details were a band across the top, which cost the photographs
            the top fifth of the window and still made the page taller than the
            screen. Beside them they cost nothing: a column of short captioned
            facts is naturally narrow, and the pictures get the full height of
            the window instead of what is left after the facts. Each column
            scrolls on its own if it has to, so the view itself never does. */}
        <div className="modal-body sr-full-body">
          <div className="sr-full-side">
            {/* What is being reviewed, at the top of the panel (Tess,
                2026-08-24: "this view needs more info on the left side panel
                including title, factory, fit date"). The style name leads;
                its number, the factory the round is with, and the fit date
                sit under it as a compact caption row. The header already
                carries the round and its rating, so those are not repeated. */}
            <div className="sr-full-head">
              <div className="sr-full-title">{styleName || "Untitled"}</div>
              <div className="sr-full-idrow">
                {styleNo && <span>{styleNo}</span>}
                {s.factory && <span>{s.factory}</span>}
                {s.fitting_date && <span>Fit {shortDate(s.fitting_date)}</span>}
              </div>
            </div>

            <RoundFacts s={s} today={today} styleId={styleId} library={library} />

            <RoundComments styleId={styleId} sampleId={s.id} threads={comments} />
          </div>

          {images.length === 0 ? (
            <div className="sr-full-empty">No sample images on this round yet.</div>
          ) : (
            /* One row, scrolled sideways (Tess, 2026-08-05: "full screen view
               should show the images horizontally with markups on them and
               comments below. user should be able to scroll horizontally").

               The two-column grid was wrong for the job this view does. Fitting
               a fourth photograph meant a second row, so comparing shot one
               with shot four meant scrolling one out of sight to reach the
               other — and comparing shots is the entire reason anybody opens a
               round full screen. A single row keeps every photograph on the
               same baseline at the same size, and moving along it is one
               gesture: a trackpad swipe, shift-wheel, or the arrow keys once
               the rail has focus.

               The markups are now drawn where they were made. A numbered dot
               sits at its own point on the garment and the same number appears
               against the sentence underneath, so "2 — 1cm too wide at the
               waist" points at the waist instead of describing it. The dots
               scale with the picture because they are positioned in per cent,
               which is how they are stored. */
            <div
              className="sr-full-rail"
              tabIndex={0}
              role="group"
              aria-label={`${images.length} photograph${images.length === 1 ? "" : "s"}, scroll sideways`}
            >
              {images.map((im) => (
                <figure className="sr-full-shot" key={im.url}>
                  {/* The frame IS the button, deliberately. The pins are
                      positioned in per cent of this box, so any padding or
                      border between the button and the picture would push every
                      mark off the garment. Reset in css, not overridden. */}
                  <button
                    type="button"
                    className="sr-full-frame"
                    onClick={() => { setEditing(im.url); setFocusPin(null); }}
                    aria-label={`Mark up ${im.label}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={im.label} />
                    {im.note.pins.map((pin, i) => (
                      <span
                        className="sr-full-pin"
                        key={pin.id}
                        style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                        title={pin.text || undefined}
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                    ))}
                  </button>
                  <figcaption>
                    <span className="k">{im.label}</span>
                    {im.note.caption && (
                      <span className="cap">
                        <Linked text={im.note.caption} block={false} />
                      </span>
                    )}
                    {im.note.pins.length > 0 && (
                      <ol className="sr-full-pins">
                        {im.note.pins.map((pin, i) => (
                          <li key={pin.id} className="sr-full-pinrow">
                            <span className="n">{i + 1}</span>
                            {/* The text is clickable too, but the Reply button is
                                the visible way in — replying should not be a
                                thing you have to know to click the row for (Tess,
                                2026-08-17: "there should be button to reply …
                                some wouldnt know to click it"). Both open this
                                mark's thread with the caret in the reply box. */}
                            <span
                              className="t"
                              onClick={() => { setEditing(im.url); setFocusPin(pin.id); }}
                            >
                              {pin.text || "No fit comment yet"}
                            </span>
                            {pin.replies.length > 0 && (
                              <span className="r">
                                {pin.replies.length} repl{pin.replies.length === 1 ? "y" : "ies"}
                              </span>
                            )}
                            <button
                              type="button"
                              className="sr-full-reply"
                              onClick={() => { setEditing(im.url); setFocusPin(pin.id); }}
                            >
                              Reply
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        {/* Rendered outside the two columns, as a sibling, so its own full
            viewport is not measured against a scrolling rail. */}
        {open && (
          <ImageNotes
            styleId={styleId}
            sampleId={s.id}
            url={open.url}
            label={open.label}
            note={open.note}
            meta={roundMeta}
            position={`${at + 1} of ${images.length}`}
            // No caption box on a fit photo — the slot label already says what
            // the picture is, and this viewer only ever shows a round's photos
            // (Tess, 2026-08-17: "remove the caption option -- we dont need this
            // on fit photos"). SlotCards and ImageStrip already switch it off for
            // sample photos; this full-screen viewer had defaulted it back on.
            caption={false}
            full
            // This viewer opens straight into full screen, so "exiting full
            // size" is the same as closing it — there is no smaller state to
            // fall back to. Without an onFull, Done / Exit full size / Escape
            // all route through `onFull?.(false)` and silently no-op, which
            // left the photo with no way out (Tess, 2026-08-17: "close function
            // isn't doing anything or allowing me to exit").
            onFull={(v) => { if (!v) { setEditing(null); setFocusPin(null); } }}
            // Land on the fit comment that was clicked in the rail, if any, and
            // clear the request once it has so the same one can be re-opened.
            openPinId={focusPin}
            onOpenedPin={() => setFocusPin(null)}
            onPrev={at > 0 ? () => { setEditing(images[at - 1].url); setFocusPin(null); } : null}
            onNext={at < images.length - 1 ? () => { setEditing(images[at + 1].url); setFocusPin(null); } : null}
            onClose={() => { setEditing(null); setFocusPin(null); }}
          />
        )}
      </div>
    </div>
  );
}

function RoundCard({
  styleId,
  styleName,
  styleNo,
  s,
  today,
  comments,
  commentThreads = [],
  library = [],
}: {
  styleId: string;
  styleName?: string | null;
  styleNo?: string | null;
  s: StyleSample;
  today: string;
  /** How many comments are filed against this round. */
  comments: number;
  /** The round's comment threads, for the full-screen viewer's Comments panel. */
  commentThreads?: FullThread[];
  library?: readonly LinkedMaterial[];
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);

  const state = sampleState(s);
  const eta = sampleEta(s, today);
  const shots = readImages(s.photos, SHOTS_KEY);
  const slotPhotos: PhotoMap = normalizePhotos(s.photos);
  // Context for the full-screen viewer (Tess, 2026-08-24): style, its number, the
  // round's factory, and the fit date on this round.
  const roundMeta = {
    name: styleName,
    styleNo,
    factory: s.factory,
    fitDate: s.fitting_date,
  };
  // Read once for the whole round rather than once per picture: the five slots
  // and the strip below them all live in this one jsonb object, and a round with
  // nine shots should not walk it nine times.
  const imageNotes = readNotes(s.photos);

  return (
    <div className={"sr-card " + state}>
      <div className="sr-head">
        <strong>{SAMPLE_ROUND_LABELS[s.round as SampleRound] ?? s.round}</strong>
        <span className={"sr-state " + state}>{SAMPLE_STATE_LABELS[state]}</span>
        {/* How it came out, in the head rather than down among the facts
            (Tess, 2026-08-05: "add a rating to each sample round as good -
            green, workable - yellow, poor - red"). A traffic light is only
            worth having if it can be read without reading — with the rounds
            stacked down the page the colours make a column that says where a
            season went wrong before anybody opens a card. Unrated shows
            nothing at all: a round logged this morning has not been judged
            yet, and a grey chip saying so would be noise on every new round. */}
        {s.rating && (
          <span className={"sr-rate " + (s.rating ?? "")} title="How this sample came out">
            {sampleRatingLabel(s.rating)}
          </span>
        )}
        {s.factory && <span className="sr-factory">{s.factory}</span>}
        {/* The answer to "when is it landing?", said once, at the top. */}
        {eta.state !== "none" && eta.state !== "landed" && (
          <span className={"sr-eta " + eta.state}>{eta.label}</span>
        )}
        {/* Points the drawer at this round and opens it. Shown even at zero —
            it is how anyone discovers a round can be talked about separately,
            and the round nobody has said anything about is often the one worth
            asking about.

            An icon, not a word (Tess, 2026-08-05: "'comment' on the 2nd proto
            should be an icon"). The head of this card is a row of words —
            "2nd Proto", the state, the factory, the ETA — and "3 comments"
            sitting among them read as another fact about the garment rather
            than as something to press. A bubble does not: it is the one shape
            in the row, it is the same shape as the drawer it opens, and the
            number now belongs to it instead of competing with it. The word is
            still there for anyone who needs it, in the tooltip and in the
            accessible name, so nothing is lost by not printing it. */}
        <button
          type="button"
          className={"sr-comments" + (comments > 0 ? " has" : "")}
          onClick={() => requestCommentScope(s.id)}
          aria-label={
            comments > 0
              ? `${comments} comment${comments === 1 ? "" : "s"} on this round`
              : "Comment on this round"
          }
          title={
            comments > 0
              ? `Read the ${comments === 1 ? "comment" : "comments"} on this round`
              : "Comment on this round"
          }
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path
              d="M3.2 2h9.6A1.2 1.2 0 0 1 14 3.2v6.4a1.2 1.2 0 0 1-1.2 1.2H6.4L3.2 14v-3.2A1.2 1.2 0 0 1 2 9.6V3.2A1.2 1.2 0 0 1 3.2 2Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          {comments > 0 && <span className="sr-cn">{comments}</span>}
        </button>
        {/* Review, send, edit — in the order they happen, and in three
            different weights on purpose. Four identical outlined buttons in a
            row told you nothing about which one you wanted; Edit is the thing
            done on this card every day, so it is the only one that keeps a
            border. Full screen and Send notes are occasional, so they read
            as links. Comment is already a link, on the left, where the count
            belongs. */}
        <span className="sr-actions">
          {/* On a phone Full screen is gone (Tess, 2026-08-11: "remove full
              screen view from sample view on mobile") — tapping a sample
              thumbnail opens the same paged image-and-notes modal directly. */}
          <span className="hide-mobile">
            <button type="button" className="btn link" onClick={() => setFull(true)}>
              Full screen
            </button>
          </span>
          <Link className="btn link" href={`/styles/${styleId}/rounds/${s.id}/export`}>
            Send notes
          </Link>
          {/* A quiet text link on the header row now, not a boxed button (Tess,
              2026-08-11: "move edit up to first row as a small text link"). */}
          <button type="button" className="btn link sr-edit" onClick={() => setOpen((o) => !o)}>
            {open ? "Close" : "Edit"}
          </button>
        </span>
      </div>

      {/* Read or write, in the same place. Never both, and never the write half
          shoved below the photographs. */}
      {open ? (
        <RoundForm styleId={styleId} s={s} onDone={() => setOpen(false)} library={library} />
      ) : (
        <RoundFacts s={s} today={today} styleId={styleId} library={library} />
      )}

      {/* The photography standard, on the round it is a photograph of. The
          progress reads against the same five slots it always did — what
          changed is that "3 of 5 shot" now means three of five for THIS round,
          which is the number the person holding the camera is actually working
          to. */}
      <div className="sr-shoot">
        <div className="sr-legend">
          Sample images <span className="ph-progress">{photoProgressLabel(slotPhotos)}</span>
        </div>
        <SlotCards
          styleId={styleId}
          sampleId={s.id}
          photos={slotPhotos}
          slots={PHOTO_SLOTS}
          notes={imageNotes}
          meta={roundMeta}
        />
      </div>

      {/* Shown whether or not there are any yet, because an empty strip with an
          Add button is how anyone finds out they can — which only works if it is
          somewhere the eye reaches. */}
      <ImageStrip
        styleId={styleId}
        sampleId={s.id}
        images={shots}
        title="Anything else"
        addLabel="Add images"
        notes={imageNotes}
        meta={roundMeta}
      />

      {full && (
        <FullRound
          styleId={styleId}
          styleName={styleName}
          styleNo={styleNo}
          s={s}
          today={today}
          images={roundImages(slotPhotos, shots, imageNotes)}
          comments={commentThreads}
          onClose={() => setFull(false)}
          library={library}
        />
      )}
    </div>
  );
}

export default function SampleRounds({
  styleId,
  styleName,
  styleNo,
  samples,
  defaultFactory,
  today,
  commentCounts = {},
  roundComments = {},
  filedOnStyle,
  styleNotes,
  materialLibrary = [],
  styleMaterialIds = [],
}: {
  styleId: string;
  /** The style's name and number, for the full-screen viewer's context line
   *  (Tess, 2026-08-24). */
  styleName?: string | null;
  styleNo?: string | null;
  samples: StyleSample[];
  defaultFactory: string;
  today: string;
  /** sample id → number of comments filed against that round. */
  commentCounts?: Record<string, number>;
  /** sample id → the round's comment threads, for the full-screen viewer's
   *  Comments panel (add + reply). Read off the same threads the drawer uses. */
  roundComments?: Record<string, FullThread[]>;
  /** Shoot slots stored on the style, from before photography moved onto rounds. */
  filedOnStyle?: PhotoMap;
  /**
   * Marks and captions written on the STYLE's pictures, keyed by image URL.
   *
   * Separate from the per-round notes because they come out of a different
   * jsonb object — styles.photos rather than style_samples.photos. A round's
   * notes are read inside RoundCard from that round's own map.
   */
  styleNotes?: Record<string, ImageNote>;
  /** The fabric & trim library a round can link to. Empty on SSYNC, which has
   *  no materials table — the picker simply does not render. */
  materialLibrary?: LinkedMaterial[];
  /** The style's overall linked materials (styles.material_ids). A new round
   *  opens pre-filled with the style's fabric and trim; the user can override
   *  (Tess, 2026-08-20). */
  styleMaterialIds?: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  // Context for the full-screen viewer on the style's own (filed-on-style) photos
  // — the round photos carry the round's own factory/fit date instead (2026-08-24).
  const styleMeta = { name: styleName, styleNo, factory: defaultFactory };

  // Adding a round now also takes its first photos in one gesture (Tess,
  // 2026-08-24: "Ability to add sample images to sample round right away"). The
  // round is created first — addSample returns its id — then each chosen file is
  // uploaded onto it, so the shots land on the round that has just been made.
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const addFileRef = useRef<HTMLInputElement | null>(null);
  const [addError, setAddError] = useState("");
  function submitAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = Array.from(addFileRef.current?.files ?? []);
    setAddError("");
    startSubmit(async () => {
      let made: { id?: string };
      try {
        made = await addSample(styleId, fd);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "Couldn't add the round.");
        return;
      }
      const newId = made.id;
      if (newId && files.length) {
        // One request per image — the body-size ceiling is per request, and one
        // oversized photo should not lose the round or the other shots.
        for (const f of files) {
          const ifd = new FormData();
          ifd.set("file", f);
          try {
            await addSampleShot(styleId, newId, ifd);
          } catch {
            /* keep going — a failed shot must not sink the whole round */
          }
        }
      }
      router.refresh();
      setAdding(false);
    });
  }

  // A new round starts with the style's fabric and trim already ticked — what it
  // is made in, until someone says this sample differs (Tess, 2026-08-20: "the
  // sample should fill in the fabric and trim details used in the overall profile,
  // user has option to override"). Packaging is deliberately left out; it is not a
  // per-round fact. Resolved against the library so a stale id is simply skipped.
  const matById = new Map(materialLibrary.map((m) => [m.id, m]));
  const defaultRoundMaterialIds = styleMaterialIds.filter((id) => {
    const m = matById.get(id);
    return !!m && m.kind !== "packaging";
  });

  // Cycle order, not insertion order. Rounds logged in one sitting share a
  // created_at, and the order Postgres returns for tied rows shifts the moment
  // one of them is edited — the season visibly re-shuffled after a save.
  const rounds = sortSamples(samples, SAMPLE_ROUNDS);

  // The round the style is on, and the ones behind it (Tess, 2026-08-05: "the
  // latest sample round should be showing. all other rounds would be viewable
  // on clicking into previous samples").
  //
  // latestSample() reads the cycle, not created_at — a 1st proto backfilled
  // after the PPS does not become the current round. Both this and the list
  // below come off the same sortSamples ordering, so the card on show is
  // always exactly the one missing from the history.
  const current = latestSample(rounds, SAMPLE_ROUNDS);

  // What the "Add sample round" form opens holding (Tess, 2026-08-06: "all
  // details should auto populate when you add a new round other than notes,
  // location, how it came out, fit status, sample requested date, sample
  // received date"). Derived from the round the style is on, so the factory
  // offered is the one the sample is actually with — see lib/roundDefaults.ts
  // for what carries, what does not, and why the ETA is in the second group
  // even though it was not named.
  const carried = nextRoundDefaults(current, defaultFactory);

  // Newest first, so the page reads backwards in time from the round on show
  // rather than restarting at the 1st proto underneath it.
  const previous = rounds.filter((r) => r.id !== current?.id).reverse();

  // A "View photo" link in the comments drawer pointing at a round that is
  // folded away. The history is unmounted, not hidden, so nothing in there can
  // answer the request — this opens it, the card builds, and the card collects
  // the request off the park on mount. See photoFocus.ts.
  useEffect(() => {
    function onFocus() {
      const want = peekPhotoFocus();
      if (!want?.sampleId) return;
      if (previous.some((r) => r.id === want.sampleId)) setShowPrevious(true);
    }
    window.addEventListener(PHOTO_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(PHOTO_FOCUS_EVENT, onFocus);
  });

  return (
    <div className="section" id="samples">
      {/* Add sample round leads the section (Tess, 2026-08-07: "add sample
          round should be at the top of profile or latest sample round instead
          of the bottom").

          It was at the foot, under the current round and under whatever the
          current round's photographs came to — which on a round with a full set
          of shots is most of a screen away from the heading that says what this
          section is. Logging a round is the single most frequent act on this
          page, and it was the one thing you had to go looking for.

          Beside the heading rather than below it, so the section reads as "here
          are the rounds, and here is how you add one" on a single line. The
          form opens directly under this, above the round it is about to become
          the newest of. */}
      <div className="sr-sechead">
        <h3>
          Sample rounds{" "}
          {current && (
            <span className="ph-progress">
              on {SAMPLE_ROUND_LABELS[current.round as SampleRound] ?? current.round}
            </span>
          )}
        </h3>
        {!adding && (
          <button className="btn ghost sm" type="button" onClick={() => setAdding(true)}>
            + Add sample round
          </button>
        )}
      </div>

      {adding ? (
        <form className="sr-form add" onSubmit={submitAdd}>
          <div className="row3">
            <div className="field">
              <label>Round</label>
              {/* required is real here — Select posts through a one-pixel text
                  input rather than a hidden one precisely so this still stops
                  a round being added with no round on it. */}
              <Select
                className="select"
                name="round"
                aria-label="Round"
                required
                defaultValue=""
                placeholder="Select…"
                options={SAMPLE_ROUNDS.map((r) => ({ value: r, label: SAMPLE_ROUND_LABELS[r] }))}
              />
            </div>
            <Field label="Factory" name="factory" defaultValue={carried.factory} />
            <StatusField />
          </div>
          <div className="row3">
            <LocationField />
            {/* Tracking number removed from the add form (Tess, 2026-08-24). */}
          </div>
          <div className="row3">
            <RatingField name="rating" />
          </div>

          <ContactFields s={carried} />

          <MaterialFields
            s={{ ...carried, material_ids: defaultRoundMaterialIds }}
            library={materialLibrary}
          />

          <div className="sr-legend">Factory</div>
          <div className="row3">
            <Field label="Sample requested" name="submitted_date" type="date" />
            <Field label="Sample received" name="received_date" type="date" />
            <Field
              label="Sample ETA"
              name="eta_date"
              type="date"
              hint="Leave blank if it is already in."
            />
          </div>

          <div className="field">
            <label>Fit notes</label>
            <NotesField name="fit_notes" />
          </div>
          <div className="field">
            <label>Factory comments that came with samples</label>
            <NotesField name="comments" />
          </div>

          {/* First photos of the round, attached the moment it is created (Tess,
              2026-08-24). Optional; the round's slots and "Anything else" strip
              are there afterwards for the rest. */}
          <div className="field">
            <label>Sample images</label>
            <input ref={addFileRef} type="file" accept="image/*" multiple className="input sr-add-files" />
            <div className="field-hint">Added to the round as soon as it is created — more can be added after.</div>
          </div>

          {addError && <div className="ph-error">{addError}</div>}

          <div className="sr-form-actions">
            <button className="btn sm" type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add sample round"}
            </button>
            <button
              className="btn link"
              type="button"
              disabled={submitting}
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}


      {!current ? (
        <>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>No sample rounds logged yet.</div>
          {/* No round means no round card, and photography lives on the round
              card now — so without this the five slots would render nowhere and
              photography would vanish from the profile of any style that has
              not been sampled yet. It did, and Tess found it in about a minute
              ("missing the photo slots on on the round", 2026-08-05). An inspo
              piece, a carry-over, a garment already hanging in the studio can
              all be shot before anybody logs a proto. So the standard sits
              here, open, until there is a round to move it onto. */}
          <PhotoSlots styleId={styleId} photos={filedOnStyle ?? {}} notes={styleNotes} hasRounds={false} meta={styleMeta} />
        </>
      ) : (
        <RoundCard
          styleId={styleId}
          styleName={styleName}
          styleNo={styleNo}
          s={current}
          today={today}
          comments={commentCounts[current.id] ?? 0}
          commentThreads={roundComments[current.id] ?? []}
          library={materialLibrary}
        />
      )}

      {/* The history. One line when shut, because that is what it is worth on a
          page about the round in hand — but it says how many rounds are in
          there, so nobody has to click to find out whether it is worth
          clicking. Kept mounted-on-demand rather than hidden with CSS: six
          closed rounds is six sets of photo cards, and there is no reason to
          pay for them to be built until somebody looks. */}
      {/* Everything that is not a round sits on one line under the rounds:
          the way back into the history, the way to start the next round, and
          the date. Three left-aligned buttons stacked one per line read as
          three unrelated offers and left a ragged edge down the page. Add a
          sample round is the only act here, so it is the only solid button. */}
      <div className="sr-foot">
        {previous.length > 0 && (
          <button
            type="button"
            className="btn link"
            onClick={() => setShowPrevious((v) => !v)}
            aria-expanded={showPrevious}
          >
            {showPrevious ? "Hide previous samples" : `Previous samples (${previous.length})`}
          </button>
        )}
        <span className="sr-today">Today {shortDate(today)}</span>
      </div>


      {previous.length > 0 && (
        <div className="sr-history">
          {showPrevious &&
            previous.map((s) => (
              <RoundCard
                key={s.id}
                styleId={styleId}
                styleName={styleName}
                styleNo={styleNo}
                s={s}
                today={today}
                comments={commentCounts[s.id] ?? 0}
                commentThreads={roundComments[s.id] ?? []}
                library={materialLibrary}
              />
            ))}
        </div>
      )}


      {/* Everything shot before photography moved onto the rounds, folded away
          under the history now that the rounds are the place to shoot. Renders
          nothing at all when there is nothing in it — so it disappears by
          itself as the old shots get re-filed onto rounds. Only reachable with
          a round on the page; the no-round case is handled above, in live
          mode, and the two must never both be on screen. */}
      {current && filedOnStyle && (
        <PhotoSlots styleId={styleId} photos={filedOnStyle} notes={styleNotes} meta={styleMeta} />
      )}
    </div>
  );
}
