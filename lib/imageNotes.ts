/**
 * Notes written ON a photograph, and a line written under it.
 *
 * Tess, 2026-08-05: "you should be able to add text comments to each image as
 * well as notate on the images."
 *
 * Two different things, and the difference is the whole point:
 *
 *   the caption   what this picture IS. One line, under the frame.
 *                 "PPS, before the collar was corrected."
 *
 *   the pins      what is WRONG WITH IT, or right about it, at a place.
 *                 A numbered mark dropped on the shoulder seam with
 *                 "1cm too wide, drops off the shoulder" attached to it.
 *
 * A fit comment that says "shoulder seam too wide" is a sentence somebody has
 * to map back onto the garment. A mark on the shoulder with the same sentence
 * hanging off it is an instruction. The studio already does this on printouts
 * with a red pen; this is the same act, kept with the photograph.
 *
 * STORAGE. A `notes` key inside the same jsonb photos map that already holds
 * the fixed slots, the gallery and the round's shots. No table, no column, no
 * migration — and every writer in this app goes through a function that carries
 * unrecognised keys straight through, so the four things sharing this map
 * cannot delete each other.
 *
 *   photos.notes = {
 *     "https://…/flat_front.jpg": {
 *       caption: "PPS, collar not yet corrected",
 *       pins: [{ id, x: 0.42, y: 0.19, text: "1cm too wide" }]
 *     }
 *   }
 *
 * KEYED BY URL, NOT BY SLOT. This is the decision worth understanding. Key a
 * note to "flat_front" and the day somebody replaces the lay flat with a
 * re-shoot, five pins written about the old garment are sitting on a new
 * photograph at coordinates that mean nothing — pointing at a shoulder that
 * has moved, describing a fault that was fixed. That is worse than losing them:
 * it is a lie the tool tells with confidence.
 *
 * Keyed by URL, a replacement is simply a picture nobody has annotated yet. The
 * old note is not deleted — it stays in the map, unread, exactly the way this
 * app treats everything it stops showing — and if that image is ever put back,
 * its marks come back with it. It also means the same photograph carries its
 * marks whether it is being looked at in a slot or in the strip below.
 *
 * Coordinates are fractions of the image box, 0–1, not pixels: the same mark
 * has to land on the same seam on a phone and on a 27-inch screen. They are
 * clamped on write, so a drag off the edge parks at the edge rather than
 * disappearing.
 *
 * Ids come from the caller. This module stays pure so node's test runner can
 * load it directly, and a function that invents a uuid is not pure.
 *
 * Dependency-free on purpose.
 */

/** Reserved key for the annotation map, inside any photos jsonb. */
export const NOTES_KEY = "notes";

/**
 * An answer to a fit comment (Tess, 2026-08-17: "Reply to fit comments in
 * thread"). A mark is a point on the garment; a reply answers that point — the
 * factory saying "corrected on the next proto", the studio saying "still 1cm
 * out". One level deep, like the style comments: a reply is not itself a place
 * on the picture, so it does not get its own mark, and there is no replying to a
 * reply. Unlike a pin, a reply is committed prose — it carries who wrote it and
 * when, so the thread reads as a conversation rather than a wall of anonymous
 * marks. Ids, author and timestamp are minted by the server action, never here:
 * this module stays pure.
 */
export type PinReply = {
  id: string;
  /** Who wrote it — an email, or "" if somehow unknown. */
  author: string;
  text: string;
  /** ISO timestamp, so replies read in the order they were written. */
  at: string;
};

export type ImagePin = {
  id: string;
  /** 0–1 across the image, left to right. */
  x: number;
  /** 0–1 down the image, top to bottom. */
  y: number;
  text: string;
  /**
   * The thread hanging off this mark. Empty for every pin written before
   * replies existed, and for every mark nobody has answered — so nothing about
   * an old note changes until someone replies to it.
   */
  replies: PinReply[];
};

export type ImageNote = {
  caption: string;
  pins: ImagePin[];
};

/** What every un-annotated image reads as. Never mutate it. */
export const EMPTY_NOTE: ImageNote = { caption: "", pins: [] };

function asObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Clamp to the image box and round to four places.
 *
 * Four is about a quarter of a percent — finer than anyone can point, and short
 * enough that a photograph with twenty marks on it does not turn into a wall of
 * floating point in the database. Anything unreadable parks in the middle
 * rather than at 0,0, because a mark in the corner looks deliberate and a mark
 * in the middle looks like it needs moving.
 */
function coord(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0.5;
  const clamped = n < 0 ? 0 : n > 1 ? 1 : n;
  return Math.round(clamped * 10000) / 10000;
}

/**
 * The replies on one pin, read defensively. A reply with no text is dropped —
 * unlike a pin (which is kept empty while it is being written), a reply only
 * ever exists once somebody has committed words to it, so an empty one is a bad
 * write, not a work in progress.
 */
function readReplies(raw: unknown): PinReply[] {
  if (!Array.isArray(raw)) return [];
  const out: PinReply[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const o = e as Record<string, unknown>;
    const text = str(o.text);
    if (!text) continue;
    let id = str(o.id) || `reply-${i}`;
    while (seen.has(id)) id = `${id}~${i}`;
    seen.add(id);
    out.push({ id, author: str(o.author), text, at: str(o.at) });
  }
  return out;
}

function readPins(raw: unknown): ImagePin[] {
  if (!Array.isArray(raw)) return [];
  const out: ImagePin[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const o = e as Record<string, unknown>;
    // A pin with no id is still a mark somebody made. Give it a positional one
    // rather than dropping it — losing a note because of a bad write is the
    // one outcome this file exists to avoid.
    let id = str(o.id) || `pin-${i}`;
    while (seen.has(id)) id = `${id}~${i}`;
    seen.add(id);
    out.push({ id, x: coord(o.x), y: coord(o.y), text: str(o.text), replies: readReplies(o.replies) });
  }
  return out;
}

/** One image's note, read defensively. Always returns a usable object. */
export function readNote(raw: unknown, url: string): ImageNote {
  const key = str(url);
  if (!key) return { caption: "", pins: [] };
  const box = asObject(raw)[NOTES_KEY];
  const entry = asObject(box)[key];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { caption: "", pins: [] };
  const o = entry as Record<string, unknown>;
  return { caption: str(o.caption), pins: readPins(o.pins) };
}

/**
 * Every note in the map, url -> note.
 *
 * Read once per card rather than once per image: the page already holds the raw
 * jsonb, and doing it this way means a round with nine shots does not walk the
 * same object nine times.
 */
export function readNotes(raw: unknown): Record<string, ImageNote> {
  const box = asObject(asObject(raw)[NOTES_KEY]);
  const out: Record<string, ImageNote> = {};
  for (const key of Object.keys(box)) {
    const note = readNote(raw, key);
    if (note.caption || note.pins.length) out[key] = note;
  }
  return out;
}

/**
 * Write one image's note back into the map, preserving every other key —
 * including every other image's note, the fixed slots, the gallery and the
 * round's shots, all of which share this object.
 *
 * A note with no caption and no pins removes its own entry. An annotation map
 * that accumulated empty shells for every picture anybody ever clicked on would
 * grow without bound and mean nothing, and there is nothing to lose: an empty
 * note is the same state as no note.
 */
function withNote(raw: unknown, url: string, note: ImageNote): Record<string, unknown> {
  const key = str(url);
  const next = asObject(raw);
  if (!key) return next;

  const box = asObject(next[NOTES_KEY]);
  if (!note.caption && note.pins.length === 0) delete box[key];
  else
    box[key] = {
      caption: note.caption,
      pins: note.pins.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        text: p.text,
        // Only written when there is a thread, so a pin nobody has answered
        // stays exactly the four-key shape it has always been in the database.
        ...(p.replies.length
          ? { replies: p.replies.map((r) => ({ id: r.id, author: r.author, text: r.text, at: r.at })) }
          : {}),
      })),
    };

  if (Object.keys(box).length === 0) delete next[NOTES_KEY];
  else next[NOTES_KEY] = box;
  return next;
}

/** Set or clear the line under the picture. Blank clears rather than storing "". */
export function withImageNoteCaption(
  raw: unknown,
  url: string,
  caption: string | null | undefined
): Record<string, unknown> {
  const note = readNote(raw, url);
  return withNote(raw, url, { ...note, caption: str(caption) });
}

/**
 * Add a mark, or move/retype one that is already there.
 *
 * Add and update are one function because they are one act to the person doing
 * it: a pin is a position and a sentence, and both are edited in the same
 * breath. An id already in the list replaces that pin in place — so re-saving
 * never duplicates, and a mark keeps its number while its text is rewritten.
 *
 * A pin with no text is kept, not dropped. Dropping an empty mark would delete
 * the pin the moment somebody clears the box to retype it.
 */
export function withImagePin(
  raw: unknown,
  url: string,
  pin: { id: string; x: number; y: number; text?: string | null }
): Record<string, unknown> {
  const id = str(pin.id);
  if (!id) return asObject(raw);
  const note = readNote(raw, url);
  const at = note.pins.findIndex((p) => p.id === id);
  // Moving or retyping a mark must not drop the conversation hanging off it: the
  // pin editor knows the position and the text, not the replies, so they are
  // carried through from the pin already in the map.
  const replies = at === -1 ? [] : note.pins[at].replies;
  const next: ImagePin = { id, x: coord(pin.x), y: coord(pin.y), text: str(pin.text), replies };
  const pins = note.pins.slice();
  if (at === -1) pins.push(next);
  else pins[at] = next;
  return withNote(raw, url, { ...note, pins });
}

/** Take a mark off the picture. Unknown ids are a no-op, not an error. */
export function withImagePinRemoved(raw: unknown, url: string, pinId: string): Record<string, unknown> {
  const want = str(pinId);
  if (!want) return asObject(raw);
  const note = readNote(raw, url);
  return withNote(raw, url, { ...note, pins: note.pins.filter((p) => p.id !== want) });
}

/**
 * Add a reply to a mark's thread (Tess, 2026-08-17: "Reply to fit comments in
 * thread"). A reply for a pin that is not there, or with no id or no text, is a
 * no-op — the same defensive stance as the rest of this file, where a bad write
 * changes nothing rather than throwing. A reply id already on the thread is
 * ignored rather than duplicated, so a double-submit lands once.
 */
export function withImagePinReply(
  raw: unknown,
  url: string,
  pinId: string,
  reply: { id: string; author?: string | null; text: string; at?: string | null }
): Record<string, unknown> {
  const pid = str(pinId);
  const rid = str(reply.id);
  const text = str(reply.text);
  if (!pid || !rid || !text) return asObject(raw);
  const note = readNote(raw, url);
  const at = note.pins.findIndex((p) => p.id === pid);
  if (at === -1) return asObject(raw);
  const pin = note.pins[at];
  if (pin.replies.some((r) => r.id === rid)) return asObject(raw);
  const pins = note.pins.slice();
  pins[at] = {
    ...pin,
    replies: [...pin.replies, { id: rid, author: str(reply.author), text, at: str(reply.at) }],
  };
  return withNote(raw, url, { ...note, pins });
}

/** Drop one reply off a mark's thread. The mark and its other replies stay. */
export function withImagePinReplyRemoved(
  raw: unknown,
  url: string,
  pinId: string,
  replyId: string
): Record<string, unknown> {
  const pid = str(pinId);
  const wid = str(replyId);
  if (!pid || !wid) return asObject(raw);
  const note = readNote(raw, url);
  const at = note.pins.findIndex((p) => p.id === pid);
  if (at === -1) return asObject(raw);
  const pins = note.pins.slice();
  pins[at] = { ...pins[at], replies: pins[at].replies.filter((r) => r.id !== wid) };
  return withNote(raw, url, { ...note, pins });
}

/**
 * "2 fit comments" / "1 fit comment" / "" — what the button on a photograph
 * says.
 *
 * The caption counts as one. To the person looking at the card there is no
 * distinction worth drawing between a line under the picture and a mark on it;
 * both are somebody having written something about this photograph, and the
 * button exists to say whether anybody has.
 *
 * "Fit comment", not "note" (Tess, 2026-08-06: "note / notes should be a Fit
 * Comments"). The drawer's count line was renamed first; this is the same
 * words arriving at the control that opens it, so the card and the drawer
 * cannot say two different things about the same writing. It is also the more
 * honest word: what gets pinned to a shoulder seam is feedback on how the
 * sample fits, and "note" described the filing, not the content.
 */
export function noteCountLabel(note: ImageNote | null | undefined): string {
  if (!note) return "";
  const n = note.pins.length + (note.caption ? 1 : 0);
  if (n === 0) return "";
  return `${n} fit comment${n === 1 ? "" : "s"}`;
}

/** True if this image has anything written about it at all. */
export function hasNote(note: ImageNote | null | undefined): boolean {
  return !!note && (!!note.caption || note.pins.length > 0);
}
