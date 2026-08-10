/**
 * What has been written ON the photographs, gathered up so it can be read
 * without opening every picture.
 *
 * Tess, 2026-08-05: "notes on the specific sample photos should show up in the
 * comments drawer under their sample round. there should be a small text link
 * to the reference photo it's commenting on."
 *
 * The marks are the right way to WRITE feedback — a sentence pinned to the
 * shoulder seam is an instruction, where "shoulder seam too wide" typed into a
 * comment box is a sentence somebody has to map back onto the garment. But they
 * were the wrong way to READ it: to find out whether anybody had said anything
 * about a round you had to click into every photograph on it, one at a time,
 * and a note nobody finds may as well not have been written.
 *
 * So the drawer shows both. Comments are the conversation about a round; these
 * are what is written on its pictures; they sit in the same place, under the
 * same round chip, and each one carries a link back to the photograph it is
 * about — because the note is only half the information, and the other half is
 * the picture with the mark on it.
 *
 * NOT A COPY. Nothing here is stored. Every entry is derived, at render, from
 * the same photos jsonb the viewer reads and writes (lib/imageNotes.ts). There
 * is one place a mark lives, it is on the picture, and this is a second window
 * onto it — so a mark edited in the viewer is already edited here, and there is
 * no second copy to fall out of step or to migrate later.
 *
 * ORDER is the order the pictures are in: the fixed slots in standard order,
 * then the strip below them. Not by date — nothing here has one — and not
 * alphabetically, which would be an order nobody is looking at.
 *
 * Pins are numbered the way the viewer numbers them: position in the list,
 * from 1. That number is on the picture, so it has to be the number here.
 *
 * Dependency-free on purpose: this is unit-tested directly by node's test
 * runner, and it takes plain shapes rather than reaching for the readers, so
 * the caller decides what "the pictures on this round, in order" means.
 */

/** One mark, as it reads in a list rather than on the photograph. */
export type PhotoNotePin = {
  /** Its number on the picture — position in the list, from 1. */
  n: number;
  text: string;
};

/** Everything written about one photograph. */
export type PhotoNoteEntry = {
  /** The round this picture belongs to, or null for the style's own pictures. */
  sampleId: string | null;
  url: string;
  /** What the picture is called where it lives: "Lay flat — front", "Shot 3". */
  label: string;
  caption: string;
  pins: PhotoNotePin[];
  /** Caption plus marks — the same arithmetic the "2 notes" button does. */
  count: number;
};

/** A picture, in the order it appears, with the name it goes by there. */
export type PhotoRef = {
  url: string;
  label: string;
};

/** Just enough of an ImageNote to be read. Structural on purpose — see above. */
type NoteLike = {
  caption?: string | null;
  pins?: readonly { text?: string | null }[] | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Gather the notes on a set of pictures, in the order the pictures are in.
 *
 * Pictures with nothing written about them are left out — this is a list of
 * what was said, and an entry saying nothing was said about the back view is
 * noise on a card that already shows the back view.
 *
 * The same URL twice (a picture filed in a slot AND in the strip, which is
 * allowed and happens) yields one entry, under the first name it went by:
 * there is one note on that file, and printing it twice would read as two
 * different people having said the same thing.
 */
export function photoNoteEntries(
  order: readonly PhotoRef[],
  notes: Readonly<Record<string, NoteLike>> | null | undefined,
  sampleId: string | null = null
): PhotoNoteEntry[] {
  if (!notes) return [];
  const out: PhotoNoteEntry[] = [];
  const seen = new Set<string>();

  for (const ref of order) {
    const url = str(ref.url);
    if (!url || seen.has(url)) continue;
    const note = notes[url];
    if (!note) continue;

    const caption = str(note.caption);
    const pins: PhotoNotePin[] = [];
    const raw = Array.isArray(note.pins) ? note.pins : [];
    for (let i = 0; i < raw.length; i++) {
      // A mark with no words is still a mark on the picture — it is numbered
      // and it is there — but it says nothing, and a list of blank lines is
      // not worth the room. It stays on the photograph either way.
      const text = str(raw[i]?.text);
      if (text) pins.push({ n: i + 1, text });
    }

    if (!caption && pins.length === 0) continue;
    seen.add(url);
    out.push({
      sampleId,
      url,
      label: str(ref.label) || "Photograph",
      caption,
      pins,
      count: pins.length + (caption ? 1 : 0),
    });
  }

  return out;
}

/** How many things are written across these pictures. */
export function countPhotoNotes(entries: readonly PhotoNoteEntry[]): number {
  let n = 0;
  for (const e of entries) n += e.count;
  return n;
}

/**
 * The entries a given drawer scope should show — the same three cases the
 * comment chips use: everything, the style's own, or one round.
 */
export function filterPhotoNotes(
  entries: readonly PhotoNoteEntry[],
  scope: string
): PhotoNoteEntry[] {
  if (scope === "all") return entries.slice();
  if (scope === "general") return entries.filter((e) => !e.sampleId);
  return entries.filter((e) => e.sampleId === scope);
}

/** "3 fit comments" / "1 fit comment" / "". */
export function photoNoteCountLabel(entries: readonly PhotoNoteEntry[]): string {
  const n = countPhotoNotes(entries);
  if (n === 0) return "";
  return `${n} fit comment${n === 1 ? "" : "s"}`;
}

/**
 * One line for everything said here, comments and marks together.
 *
 * Tess, 2026-08-05: "rethink how notes from photos are added to the drawer --
 * it doesn't make logical sense how they show up rn."
 *
 * It didn't, and the count was the loudest part of why. The drawer printed two
 * headings that each claimed to be the total: "No comments" from the
 * conversation, and "1 note on the photographs" from the block underneath it,
 * so a round somebody HAD written on announced that nothing had been said about
 * it (the same contradiction Tess caught on 2026-08-05: "this doesnt make sense
 * to say no notes"). Patching it by hiding one of the two headings left the
 * reader adding up two numbers that were never shown together.
 *
 * There is one number now, and it is a sentence: "3 comments · 2 fit
 * comments". The halves are still named, because where feedback was written is
 * worth knowing — a mark on the shoulder seam and a typed paragraph are not the
 * same kind of thing — but they are one reading, in one place, and neither can
 * contradict the other.
 *
 * Nothing at all reads "Nothing yet", not "No comments": the drawer holds both
 * kinds and should not report on only one of them when it is empty.
 */
export function feedbackCountLabel(
  commentTotal: number,
  entries: readonly PhotoNoteEntry[]
): string {
  const comments = Math.max(0, Math.floor(commentTotal || 0));
  const marks = countPhotoNotes(entries);
  if (comments === 0 && marks === 0) return "Nothing yet";
  const parts: string[] = [];
  // "General comment", not "comment" (Tess, 2026-08-06: "change to 1 general
  // comment * 1 fit commment"). Once the other half of the line became "fit
  // comments", a bare "comment" beside it read as the generic word covering
  // both rather than as the name of one of them — "1 comment · 1 fit comment"
  // parses as a total and a subset. Naming both halves makes it a pair.
  if (comments > 0)
    parts.push(`${comments} general comment${comments === 1 ? "" : "s"}`);
  if (marks > 0) {
    // "fit comments" is what the studio calls these (Tess, 2026-08-06: "change
    // notes on the sample images to be referenced as fit comments"). It names
    // the thing rather than its filing location: a mark pinned to a shoulder
    // seam is feedback on how the sample fits, and "notes on the sample images"
    // described only where it happened to be written down. It is also shorter,
    // which matters on a line that has to hold two counts.
    parts.push(`${marks} fit comment${marks === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
