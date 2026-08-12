// Threaded notes stored in a jsonb column — the moodboard's note shape, made
// reusable for the linesheet (Tess, 2026-08-12: "users would have the ability to
// leave notes in it like the moodboard"). Pure and dependency-free: the array
// operations and the defensive read live here; the id/timestamp minting and the
// author/god-mode gate live in the server action that calls these.

export type NoteReply = { id: string; by: string; ts: number; text: string };
export type Note = { tid: string; text: string; by: string; ts: number; replies: NoteReply[] };

const MAX_NOTES = 500;
const MAX_TEXT = 4000;

function trimTo(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalizeReply(raw: unknown): NoteReply | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id ? r.id : "";
  const text = trimTo(r.text, MAX_TEXT);
  if (!id || !text) return null;
  return { id, text, by: trimTo(r.by, 120), ts: typeof r.ts === "number" ? r.ts : 0 };
}

/** Read whatever is stored into a clean, well-formed note list. */
export function normalizeNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  const out: Note[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const tid = typeof o.tid === "string" && o.tid ? o.tid : "";
    const text = trimTo(o.text, MAX_TEXT);
    if (!tid || !text) continue;
    const replies = Array.isArray(o.replies)
      ? (o.replies.map(normalizeReply).filter(Boolean) as NoteReply[])
      : [];
    out.push({ tid, text, by: trimTo(o.by, 120), ts: typeof o.ts === "number" ? o.ts : 0, replies });
    if (out.length >= MAX_NOTES) break;
  }
  return out;
}

export function addNote(notes: Note[], note: Note): Note[] {
  return [...notes, note];
}

export function addReplyTo(notes: Note[], tid: string, reply: NoteReply): Note[] {
  return notes.map((n) => (n.tid === tid ? { ...n, replies: [...n.replies, reply] } : n));
}

/** Set a note's text; a blank is ignored (a note is never emptied to nothing). */
export function setNoteText(notes: Note[], tid: string, text: string): Note[] {
  const t = text.trim();
  if (!t) return notes;
  return notes.map((n) => (n.tid === tid ? { ...n, text: t.slice(0, MAX_TEXT) } : n));
}

export function removeNote(notes: Note[], tid: string): Note[] {
  return notes.filter((n) => n.tid !== tid);
}

export function findNote(notes: Note[], tid: string): Note | undefined {
  return notes.find((n) => n.tid === tid);
}
