// ---------------------------------------------------------------------------
// Who gets told, and what it says (P4 — notifications)
//
// Two things happen on a style that someone else is waiting on: a comment gets
// left, and a status moves. Today you only find out by opening the page. This
// decides who should hear about it and what the email reads like.
//
// It is deliberately pure and knows nothing about email. No provider, no fetch,
// no keys — the send is a thin shell around this, and when no provider key is
// configured the shell no-ops instead of throwing. That means notifications can
// be built, tested and reasoned about now, and start actually sending the day a
// key exists, without touching this file.
//
// Three rules, all learned from systems people end up muting:
//
//   * Never tell someone what they just did. A "you commented" email is how a
//     team learns to filter the whole sender to trash, and then they miss the
//     one that mattered.
//   * Silence is not consent, but it isn't refusal either. A person with no
//     saved preference is subscribed, because a new hire who hears nothing for
//     a month has been quietly cut out of the conversation. Opting out is a
//     decision someone makes, not a default they fall into.
//   * Say the thing in the subject line. "Update on style SS-1042" makes you
//     open an email to find out whether you care; "Cropped Rib Tank moved to
//     production" doesn't.
//
// Preferences live in the existing `settings` table under `key = 'notifications'`,
// the same shape-agnostic jsonb the curated lists use. No migration: the studio
// database does not get a schema change for a mail toggle.
// ---------------------------------------------------------------------------

export type NotifyChannel = "comment" | "status";

/** `{ "kara@theloyalist.com": { comment: true, status: false } }` */
export type NotifyPrefs = Record<string, Partial<Record<NotifyChannel, boolean>>>;

export type NotifyEvent =
  | {
      kind: "comment";
      styleId: string;
      styleName: string;
      actor: string | null;
      body: string;
    }
  | {
      kind: "status";
      styleId: string;
      styleName: string;
      actor: string | null;
      from: string | null;
      to: string;
    }
  | {
      kind: "comment_received";
      styleId: string;
      styleName: string;
      actor: string | null;
      /** The person who left the comment — the only one who wants this. */
      commentAuthor: string | null;
      commentBody: string;
    };

export type Email = { to: string; subject: string; text: string };

/** Which preference switch an event answers to. */
export function channelOf(event: NotifyEvent): NotifyChannel {
  return event.kind === "status" ? "status" : "comment";
}

/** Addresses are compared lowercased and trimmed; `Kara@` and `kara@` are one person. */
function norm(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

function uniq(list: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/**
 * The people with a stake in a style: whoever created it, and everyone who has
 * said something on it.
 *
 * There is no "watchers" table and this does not want one — a follow list is a
 * thing people forget to join and then blame the tool. Having made the style or
 * having spoken about it is the honest signal that you care what happens next,
 * and both are already in the database.
 */
export function watchersOf(input: {
  createdBy?: string | null;
  commentAuthors?: (string | null)[];
}): string[] {
  return uniq([norm(input.createdBy), ...(input.commentAuthors ?? []).map(norm)]).sort();
}

/**
 * Has this person switched this kind of mail off?
 *
 * Unset means yes, send — see the second rule above. Only an explicit `false`
 * silences anything.
 */
export function wantsEmail(prefs: NotifyPrefs, email: string, channel: NotifyChannel): boolean {
  const e = norm(email);
  if (!e) return false;
  return prefs?.[e]?.[channel] !== false;
}

/** Everyone who should get mail about this event, actor excluded, in a stable order. */
export function recipientsFor(
  event: NotifyEvent,
  watchers: string[],
  prefs: NotifyPrefs = {}
): string[] {
  const actor = norm(event.actor);
  const channel = channelOf(event);

  // Marking a comment received is a reply to one person. Mailing the whole
  // style about it turns an answer into an announcement.
  const pool =
    event.kind === "comment_received"
      ? [norm(event.commentAuthor)].filter(Boolean as unknown as (v: string | null) => v is string)
      : uniq(watchers.map(norm));

  return pool.filter((e) => e !== actor && wantsEmail(prefs, e, channel)).sort();
}

const STATUS_LABELS: Record<string, string> = {
  inspo: "Inspo",
  development: "Development",
  production: "Production",
  archived: "Archived",
};

export function statusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  return STATUS_LABELS[s.toLowerCase()] ?? (s || "—");
}

/** A name to put in a sentence. The local part of an address beats the address. */
export function actorName(email: string | null | undefined): string {
  const e = norm(email);
  if (!e) return "Someone";
  return e.split("@")[0];
}

/** Keep an email readable when someone pastes an essay into a comment. */
export function excerpt(text: string, max = 600): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  // Cut at a word so the tail isn't a severed syllable.
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

export function styleUrl(baseUrl: string, styleId: string): string {
  return `${(baseUrl || "").replace(/\/+$/, "")}/styles/${styleId}`;
}

export function subjectFor(event: NotifyEvent): string {
  switch (event.kind) {
    case "comment":
      return `New comment on ${event.styleName}`;
    case "status":
      return `${event.styleName} moved to ${statusLabel(event.to)}`;
    case "comment_received":
      return `Your comment on ${event.styleName} was marked received`;
  }
}

export function bodyFor(event: NotifyEvent, baseUrl: string): string {
  const who = actorName(event.actor);
  const link = styleUrl(baseUrl, event.styleId);
  const lines: string[] = [];

  switch (event.kind) {
    case "comment":
      lines.push(`${who} commented on ${event.styleName}:`, "", excerpt(event.body));
      break;
    case "status": {
      // The old status is worth a sentence — "moved to Production" answers less
      // than "moved from Development to Production" when you've been away.
      const from = event.from ? statusLabel(event.from) : null;
      lines.push(
        from
          ? `${who} moved ${event.styleName} from ${from} to ${statusLabel(event.to)}.`
          : `${who} set ${event.styleName} to ${statusLabel(event.to)}.`
      );
      break;
    }
    case "comment_received":
      lines.push(
        `${who} marked your comment on ${event.styleName} as received:`,
        "",
        excerpt(event.commentBody)
      );
      break;
  }

  lines.push("", link, "", "— SSYNC");
  return lines.join("\n");
}

/** One event in, the actual messages out. Empty when nobody should hear about it. */
export function buildEmails(
  event: NotifyEvent,
  watchers: string[],
  prefs: NotifyPrefs,
  baseUrl: string
): Email[] {
  const subject = subjectFor(event);
  const text = bodyFor(event, baseUrl);
  return recipientsFor(event, watchers, prefs).map((to) => ({ to, subject, text }));
}

// ---------------------------------------------------------------------------
// Preferences, read and written the way the curated lists are: merged, never
// clobbered, so one person saving their own switches cannot wipe anyone else's.
// ---------------------------------------------------------------------------

export function normalizePrefs(raw: unknown): NotifyPrefs {
  const out: NotifyPrefs = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const e = norm(key);
    if (!e || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const entry: Partial<Record<NotifyChannel, boolean>> = {};
    for (const channel of ["comment", "status"] as NotifyChannel[]) {
      if (typeof v[channel] === "boolean") entry[channel] = v[channel] as boolean;
    }
    out[e] = entry;
  }
  return out;
}

/** One person's switches changed; everyone else's row survives untouched. */
export function setPrefs(
  prefs: NotifyPrefs,
  email: string,
  next: Partial<Record<NotifyChannel, boolean>>
): NotifyPrefs {
  const e = norm(email);
  if (!e) return prefs;
  return { ...prefs, [e]: { ...(prefs[e] ?? {}), ...next } };
}
