// Shared row types matching the Supabase schema.

export type Reference = {
  id: string;
  image: string | null;
  thumb: string | null;
  image_url: string | null;
  thumb_url: string | null;
  designer: string;
  year: string | null;
  season: string | null;
  category: string | null;
  garment: string | null;
  fabric: string | null;
  color: string | null;
  color_hex: string | null;
  photographer: string | null;
  photographer_ig: string | null;
  model: string | null;
  location: string | null;
  link: string | null;
  price: string | null;
  notes: string | null;
  type: string | null;
  extra_images: ExtraImage[] | null;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string | null;
};

// extra_images rows are stored either as plain URL strings or as
// { image_url, thumb_url } objects (the shape the original importer wrote).
export type ExtraImage =
  | string
  | { image_url?: string | null; thumb_url?: string | null };

// Tess, 2026-08-06: "remove inspo from development". Inspo is gone from the
// list a person can pick, because it was the stage BEFORE this tool: an idea
// with no style number is a reference, and references have their own half of
// the app now. A style existing at all means somebody decided to make it.
//
// It is removed from the OFFERED list, not from the vocabulary — the label
// below still resolves "inspo" so any row written before today reads as a word
// rather than as a blank, and DevTabs files such a row under Development so it
// cannot fall out of every tab and vanish. Nothing was rewritten in the
// database; checked first, and no live style is on inspo.
export const STYLE_STATUSES = ["development", "production", "archived"] as const;
export type StyleStatus = (typeof STYLE_STATUSES)[number];

// The status values are lowercase in the database and stay that way — they are
// keys, not prose. Everywhere a person reads one, they read this instead, so
// "development" never appears mid-sentence in lower case next to a capitalised
// dropdown. Same pattern as SAMPLE_ROUND_LABELS below.
// The word on the dropdown is "Sampling" (Tess, 2026-08-07: "on style profile,
// update the status dropdown to be sampling, production, archived").
//
// The stored value stays "development" and is not being rewritten. It is the
// key every row in the database, every filter and every notification already
// uses, and renaming a key to change a caption is how a rename turns into an
// outage. This is the only place the word is decided, so one line changes what
// every screen says.
//
// It is also the more accurate word. A style at this stage is having samples
// made — the Development page is the place, and sampling is the activity.
export const STYLE_STATUS_LABELS: Record<StyleStatus, string> = {
  development: "Sampling",
  production: "Production",
  archived: "Archived",
};

/** Statuses no longer offered, kept only so an old row still reads as a word. */
export const RETIRED_STYLE_STATUS_LABELS: Record<string, string> = {
  inspo: "Inspo",
};

export function styleStatusLabel(s: string | null | undefined): string {
  const key = (s ?? "").trim();
  return (
    STYLE_STATUS_LABELS[key as StyleStatus] ?? RETIRED_STYLE_STATUS_LABELS[key] ?? (s ?? "—")
  );
}

export const SAMPLE_ROUNDS = ["proto1", "proto2", "proto3", "sms", "pps1", "pps2", "bulk"] as const;
export type SampleRound = (typeof SAMPLE_ROUNDS)[number];

export const SAMPLE_ROUND_LABELS: Record<SampleRound, string> = {
  proto1: "1st Proto",
  proto2: "2nd Proto",
  proto3: "3rd Proto",
  sms: "SMS",
  pps1: "1st PPS",
  pps2: "2nd PPS",
  bulk: "Bulk",
};

// Where the physical sample is (Tess, 2026-08-05: "add 'current sample
// location' into sample rounds. options would be office, factory,
// photographer, pr, sent to talent, custom").
//
// "custom" is the escape hatch, not a place — choosing it reveals a text box
// and what gets stored is whatever was typed there, so the column always holds
// the real answer and never the word "custom". That keeps this list honest: if
// "sent to talent" is picked, the row says "sent to talent"; if a garment is at
// a tailor in Queens, the row says so, and the list can grow later without a
// migration or a lookup table.
export const SAMPLE_LOCATIONS = [
  "office",
  "factory",
  "photographer",
  "pr",
  "sent to talent",
  // Between two of the others (Tess, 2026-08-06: "add in transit as an
  // option add a place for tracking number"). Every location above is a place
  // a sample sits; this is the one state where it sits nowhere, and without it
  // a garment in a courier's van had to be filed under wherever it had left or
  // wherever it was going — both of which are wrong in the way that gets
  // somebody sent to a shelf to look for it.
  "in transit",
] as const;
export type SampleLocation = (typeof SAMPLE_LOCATIONS)[number];

export const SAMPLE_LOCATION_LABELS: Record<SampleLocation, string> = {
  office: "Office",
  factory: "Factory",
  photographer: "Photographer",
  pr: "PR",
  "sent to talent": "Sent to talent",
  "in transit": "In transit",
};

/** Title case for a known location, the stored text for anything else. */
export function sampleLocationLabel(v: string | null | undefined): string {
  const key = (v ?? "").trim();
  if (!key) return "";
  return SAMPLE_LOCATION_LABELS[key as SampleLocation] ?? key;
}

// What is happening with this round (Tess, 2026-08-05: "status options should
// be: needs to fit, notes sent to factory, with designer, not moving
// forward").
//
// This is the ROUND's status, not the style's. The style's status is
// STYLE_STATUSES above — inspo / development / production / archived — which
// is what drives the library-to-development pipeline and the archive, and none
// of those four new values describe a whole style's life. All four describe a
// sample that has landed: it needs fitting, the notes have gone back, it is
// sitting with the designer, or it is dead. The round status is also the only
// status in the tool that had no options at all until now — it was a free text
// box with the placeholder "e.g. fit ok" — so this is the field the request
// fits, and moving it to the style is a one-line change if that reading is
// wrong.
//
// Stored lowercase as keys, read through sampleStatusLabel. Anything typed
// into the old free-text box survives: it is not in this list, so the select
// carries it as an extra option and it keeps displaying verbatim.
// Tess, 2026-08-07: "update fitting status to be more logical as to what
// potential statuses those could be".
//
// The four this started as were the four she named off the top of her head, and
// they had a hole in the middle of them: there was no way to say a sample was
// FINE. A round could be waiting to be fitted, out with the designer, back with
// the factory or dead — and the one outcome the whole exercise is aiming at,
// this one is right, make it, had to be typed into the notes.
//
// Six now, in the order a sample actually moves through them:
//
//   needs to fit          it has landed and nobody has put it on a body yet.
//   with designer         being looked at. The one state where the ball is
//                         inside the studio and not with anybody else.
//   notes sent to factory the corrections have gone back. Waiting on them.
//   approved              it is right. This is the end of the line for a round
//                         and the only status that closes one happily.
//   on hold               paused for a reason outside the garment — a fabric
//                         that has not landed, a delivery that moved. Distinct
//                         from "not moving forward", which is a decision about
//                         the style; this one is a decision about the calendar,
//                         and conflating them loses whether it is coming back.
//   not moving forward    dead.
//
// The four original values are kept EXACTLY as they were stored. Only the
// caption on the first one changed, and captions are read through
// SAMPLE_STATUS_LABELS, so no round anywhere needs rewriting and nothing typed
// into the free-text box this field used to be stops displaying.
// Tess, 2026-08-07: "Fitting status updates / Fitting scheduled for (date) /
// With designer for edits / Approved with minor notes / Approved with no
// notes".
//
// Two changes. "Fitting scheduled" is a new state between the sample landing
// and anybody putting it on a body — the difference between nobody has booked
// it and it is booked for Thursday, which is most of what a fitting week is.
// Its date lives in style_samples.fitting_date rather than inside the words,
// because a date typed into a status cannot be sorted, compared to today, or
// asked "what is being fitted this week".
//
// And Approved splits in two. "Approved with minor notes" and "approved with no
// notes" are both yes, and they mean completely different things to the person
// who has to decide whether another round is needed. One yes for both was the
// thing that made the old single Approved nearly useless.
//
// Every value stored before today is still in this list, unchanged. Only
// captions and order moved, so nothing needs rewriting and nothing typed into
// the free-text box this field used to be stops displaying.
export const SAMPLE_STATUSES = [
  "needs to fit",
  "fitting scheduled",
  "with designer",
  "notes sent to factory",
  "approved minor notes",
  "approved",
  "on hold",
  "not moving forward",
] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  "needs to fit": "Needs fitting",
  "fitting scheduled": "Fitting scheduled",
  "with designer": "With designer for edits",
  "notes sent to factory": "Notes sent to factory",
  "approved minor notes": "Approved with minor notes",
  // The stored value stays "approved" — it is what every round saved before
  // today holds, and those rounds were approved with nothing outstanding.
  approved: "Approved with no notes",
  "on hold": "On hold",
  "not moving forward": "Not moving forward",
};

export function sampleStatusLabel(v: string | null | undefined): string {
  const key = (v ?? "").trim();
  if (!key) return "";
  return SAMPLE_STATUS_LABELS[key as SampleStatus] ?? key;
}

/**
 * The status as somebody reads it, with the fitting date folded in.
 *
 * "Fitting scheduled for 12 Aug 26" is the whole sentence she asked for, and it
 * is assembled here rather than stored that way so the date stays a date.
 *
 * A booked fitting with no date still reads "Fitting scheduled" rather than
 * "Fitting scheduled for" trailing off — a half-written sentence looks like a
 * bug, and the missing date is the person's to add, not this function's to
 * apologise for.
 */
export function sampleStatusText(
  status: string | null | undefined,
  fittingDate: string | null | undefined,
  fmt: (d: string) => string
): string {
  const label = sampleStatusLabel(status);
  const key = (status ?? "").trim();
  const date = (fittingDate ?? "").trim();
  if (key !== "fitting scheduled" || !date) return label;
  const shown = fmt(date);
  return shown ? `${label} for ${shown}` : label;
}

// How the sample came out (Tess, 2026-08-05: "add a rating to each sample round
// as good - green, workable - yellow, poor - red").
//
// Three values and no fourth, because the point of a traffic light is that it
// is read without being read — a colour across a season of rounds says where
// the trouble is before anybody opens a card. A fifth shade would need looking
// at, which is the thing this field exists to avoid.
//
// It is deliberately NOT the fitting status. The status says what is happening
// next (needs to fit, notes sent to factory); the rating says how the garment
// actually came back. A sample can be poor and have had its notes sent, or good
// and still be waiting on the designer — one field could not hold both without
// losing one of them.
//
// Unrated is a real state and the default. A round logged this morning has not
// been seen yet, and a tool that starts everything at "good" is a tool that
// reports a season is fine because nobody has looked.
export const SAMPLE_RATINGS = ["good", "workable", "poor"] as const;
export type SampleRating = (typeof SAMPLE_RATINGS)[number];

export const SAMPLE_RATING_LABELS: Record<SampleRating, string> = {
  good: "Good",
  workable: "Workable",
  poor: "Poor",
};

/** Title case for a known rating, the stored text for anything else, "" for none. */
export function sampleRatingLabel(v: string | null | undefined): string {
  const key = (v ?? "").trim();
  if (!key) return "";
  return SAMPLE_RATING_LABELS[key as SampleRating] ?? key;
}

export type Style = {
  id: string;
  style_no: string | null;
  name: string;
  category: string | null;
  garment: string | null;
  // What it is being made in. The library has recorded fabric on a reference
  // since the beginning; a style in development had nowhere to put it, so the
  // question asked about every single sample lived in free-text notes or in
  // somebody's head (Tess, 2026-08-05: "add fabric under details as well").
  // Nullable, and every style that predates it reads "—" exactly as before.
  fabric: string | null;
  // The colourway, or colourways, this style is being made in (Tess,
  // 2026-08-05: "Include color(s) as field option(s) in details"). One free
  // text field rather than a list: a style is quoted as "black / bone / olive"
  // in every email and every tech pack, and splitting that into rows would
  // make the person typing it do work the screen was going to rejoin anyway.
  // Nullable and additive — every style that predates it reads "—".
  colors: string | null;
  // The spec fields off the New Product form (Tess, 2026-08-07: "make sure the
  // detail fields on the style profile include all of these"). All nullable and
  // additive; a style that predates them reads "—".
  //
  // Only the ones that were genuinely missing are here. Product type is
  // `garment`, Product Color is `colors`, and Material is `fabric` — adding a
  // second field for a fact SSYNC already holds would give two answers to one
  // question and let them disagree.
  //
  // Fabric type is not Material: one is jersey or twill, the other is 100%
  // cotton, and a factory needs both.
  blank_style: string | null;
  // What it is made OF, against fabric above which is what it is made IN
  // (Tess, 2026-08-07: "add material into the detials and csv export"). Jersey
  // is the fabric type; 100% cotton is the material, and a factory quoting a
  // price and a customs form filing an entry each need a different one of them.
  material: string | null;
  // Customs. These travel with a shipment rather than with a design, and they
  // are the two fields nobody can remember and everybody has to ask for.
  hs_code: string | null;
  country_of_origin: string | null;
  /** Pounds, to three places. A number because it gets summed for a shipment. */
  weight_lbs: number | null;
  designer: string | null;
  brand: string | null;
  status: StyleStatus;
  stage: string | null;
  evergreen: boolean;
  season: string | null;
  factory: string | null;
  cover_image: string | null;
  tech_pack_url: string | null;
  // The work-in-progress folder — the live one, where photographs from the
  // floor and marked-up pages accumulate while a style is being made (Tess,
  // 2026-08-06: "add WIP under factory / next to techpack -- that should be a
  // link like tech pack -- Open WIP"). A second link rather than a second kind
  // of thing: the tech pack is what was specified and the WIP is what is
  // happening, and the two are asked for by different people on the same day.
  // Nullable and additive — every style that predates it reads "—".
  wip_url: string | null;
  notes: string | null;
  // The running fit story that carries across sample rounds — block, pattern,
  // the thing we keep getting wrong. Per-round fit is on StyleSample.
  fit_notes: string | null;
  // The photography standard's slots, keyed by slot id. See lib/photoSlots.ts —
  // always read this through normalizePhotos rather than indexing it directly.
  photos: Record<string, string> | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  // When this style was submitted to the Style Library, or null.
  //
  // Tess, 2026-08-06: "style library should only have finished styles that have
  // been submitted to style library". The Library used to be computed — anything
  // in Production or Archived appeared in it — and that was wrong in both
  // directions: a style archived because it was abandoned turned up on the shelf
  // of things worth remaking, and a block she wanted to keep could not be put
  // there until its stage said so. Membership is now a decision somebody makes,
  // stored here.
  //
  // A timestamp rather than a boolean, on the same reasoning as deleted_at:
  // "when did this go in" is a question people ask, and true/false cannot answer
  // it. Nullable and additive — every style that predates it reads as not in the
  // Library, which is correct, and nothing was rewritten to make that true.
  library_at: string | null;
  // In the Trash, or not (Tess, 2026-08-05: "you should be able to delete a
  // style and have it sent to the trash"). NULL means live. A timestamp means
  // the app has stopped reading it — the row, its rounds, its photographs and
  // its comments are all still there, untouched, and Restore puts it straight
  // back. Nothing in this app hard-deletes a style. Additive and nullable, so
  // every style that predates the column reads as live, which it is.
  deleted_at: string | null;
};

export type StyleVersion = {
  id: string;
  style_id: string;
  version_no: number;
  changes: string | null;
  season: string | null;
  image: string | null;
  is_ai_generated: boolean;
  notes: string | null;
  // The profile this entry made, when it made one (Tess, 2026-08-05:
  // "versions listed should hyperlink to new proifle"). Duplicate + edit
  // creates a WHOLE SEPARATE STYLE — its own rounds, its own photography —
  // and until now it left no trace of itself on the style it came from, so
  // the original's Versions list had nothing to point at. This column is that
  // trace, and it is the only thing that lets the line be a link. NULL for
  // every other kind of version, which stay linked to their image as before.
  spawned_style_id: string | null;
  // Off the list, not out of the table (Tess, 2026-08-05: "delete v1new
  // colorway - whiteSS272026-08-05"). NULL means live, which every version
  // written before this column is. A timestamp means the Versions list and the
  // export stop showing it; the row, its text, its season and its image all
  // stay, and setting the column back to null puts it straight back.
  deleted_at: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type StyleSample = {
  id: string;
  style_id: string;
  round: string;
  factory: string | null;
  submitted_date: string | null;
  received_date: string | null;
  status: string | null;
  // Who at the factory this round is with (Tess, 2026-08-05: "Add contact for
  // sample"). Two columns rather than one because they answer two different
  // questions: the name is what the card shows — who do I chase about this
  // proto — and the address is only ever used to fill in the "To" line when the
  // round is exported. A round can perfectly well have a name and no address.
  contact_name: string | null;
  contact_email: string | null;
  // Where the physical garment is right now (Tess, 2026-08-05: "add 'current
  // sample location' into sample rounds"). Stored as free text so a value
  // somebody typed before the list existed still reads back, and so "custom"
  // can hold whatever the actual answer was — see SAMPLE_LOCATIONS.
  location: string | null;
  // The courier reference, for the leg where the sample is nowhere (Tess,
  // 2026-08-06: "add in transit as an option add a place for tracking
  // number"). It lives on the round rather than on the style because a style
  // has many shipments and each one is a different round going out or coming
  // back. Free text, no carrier field: what gets read out over the phone is
  // the number, and half of them are pasted in with the carrier already in
  // front of them. Nullable — a round that never shipped anywhere has none.
  tracking_number: string | null;
  // How the sample came out — good / workable / poor, or null for not yet
  // judged (Tess, 2026-08-05: "add a rating to each sample round as good -
  // green, workable - yellow, poor - red"). Nullable text rather than an enum
  // so the list can grow without a migration, exactly like status and location.
  rating: string | null;
  // When the fitting is booked for (Tess, 2026-08-07: "Fitting scheduled for
  // (date)"). A real date column rather than words inside the status, so
  // "what is being fitted this week" is a question that can be asked.
  // Nullable: most rounds never have one, and a status of "fitting scheduled"
  // with no date yet is a legitimate half-answer.
  fitting_date: string | null;
  // What was said to or heard from the factory about this submission.
  comments: string | null;
  // How this round actually fitted — kept apart from `comments` so fit history
  // can be read on its own.
  fit_notes: string | null;
  // The raw-material leg: fabric and trim have to land at the factory before a
  // round can start, and that is where the time is usually lost.
  material_supplier: string | null;
  // What the fabric is, and what it is made of. Two fields because they are
  // asked for by different people — "Cotton jersey" answers the designer,
  // "94% cotton, 6% elastane" answers the factory and the paperwork.
  material_type: string | null;
  material_contents: string | null;
  // Everything else about the material for this round, including dates. The
  // four material_*_date columns below are no longer offered as inputs; they
  // keep whatever they already hold and are shown read-only where present.
  material_notes: string | null;
  material_ordered_date: string | null;
  material_eta_date: string | null;
  material_received_date: string | null;
  // When the SAMPLE is expected back from the factory. Not the same thing as
  // material_eta_date, which is when the fabric reaches the factory — usually
  // weeks earlier and a different person's problem.
  eta_date: string | null;
  // Shots of what actually arrived in this round, keyed by id. Read through
  // lib/imageList.ts; never index it directly.
  photos: Record<string, unknown> | null;
  created_at: string | null;
};

export type StyleComment = {
  id: string;
  style_id: string;
  version_id: string | null;
  author: string | null;
  body: string;
  status: string | null;
  // The comment this one replies to, or null for a top-level comment. One level
  // deep by convention — see lib/commentTree.ts, which re-parents a reply-to-a-
  // reply onto its thread root rather than nesting further.
  parent_id: string | null;
  // The sample round this comment is about, or null for a comment about the
  // style as a whole. Every comment written before 2026-08-04 is null, which is
  // exactly what it already meant. A reply follows its thread root's scope
  // regardless of what this says — see lib/commentTree.ts.
  sample_id: string | null;
  created_at: string | null;
  // When the author withdrew it, or null for a live comment. Added 2026-08-06
  // (Tess: "allow for comments to be deleted"). Nothing is removed from the
  // table — a deleted comment keeps its words and its author, stops being
  // shown to everybody else, and its own author still sees it dimmed with a
  // Restore button. See lib/commentEdit.ts and the style_comments_deleted_at
  // migration.
  deleted_at?: string | null;
};

// Best available image URL for a reference row.
export function refImage(r: Pick<Reference, "image_url" | "image" | "thumb_url" | "thumb">): string {
  return r.image_url || r.image || r.thumb_url || r.thumb || "";
}

// Small image for anywhere that shows many references at once — the library
// grid, moodboard tiles, the trash. Prefers the generated thumbnail and falls
// back to the full image for rows that predate it. Detail views, which show one
// image large, should keep using refImage().
export function refThumb(r: Pick<Reference, "image_url" | "image" | "thumb_url" | "thumb">): string {
  return r.thumb_url || r.thumb || r.image_url || r.image || "";
}

// Normalize extra_images (strings or {image_url,thumb_url} objects) to a flat
// list of full-image URLs, dropping anything empty.
export function extraImageUrls(r: Pick<Reference, "extra_images">): string[] {
  const arr = r.extra_images;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((e) => (typeof e === "string" ? e : e?.image_url || e?.thumb_url || ""))
    .filter(Boolean) as string[];
}
