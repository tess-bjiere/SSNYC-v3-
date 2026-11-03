/**
 * People as records, and the tags that put them on images (Tess, 2026-11-02:
 * "i need recommendation on how to best organize the various image databases for
 * campaign, mood, photographer, model" — and, to the recommendation, "Yes, build
 * phase 1").
 *
 * Until now a photographer or a model was only a name that recurred on rows in
 * `references`, and the directory grouped rows by that name. That is why a typo
 * or a "(DP)" split one person into two cards, why "location" had to mean both
 * where a picture was shot and where someone lives, and why one picture needed
 * a copy per place it belonged. Phase 1 gives each person a row of their own in
 * `people` (db/p30) and records which images they are on in `reference_people`.
 *
 * In this phase the TAG FOLLOWS THE CREDIT. The text typed on an image is still
 * what the team edits, and this module derives the tags from it:
 *
 *   a directory's own rows  (roster for a photographer, model for a model) —
 *                           the credit IS the person, so a name nobody has a
 *                           record for creates one (or brings back a removed
 *                           one, card and all, rather than starting blank).
 *   every other row         (Campaign, Archival, References, a photo credit on a
 *                           model row) — tags only someone who already has a
 *                           record. A credit there never makes a card: that is
 *                           what put photographers "under campaign" before.
 *
 * A credit naming several people ("Ana, Bea") tags each of them; "&" is left
 * alone because it is how a duo is named ("Louise & Maria Thornfeldt").
 *
 * Phase 3 turns this around (tag from the image itself, credit derived); until
 * then the planner below is the one place the rule lives — the in-app sync, the
 * catch-up on Setup and the demo preview all run it.
 *
 * Dependency-free like the rest of lib/: structural types only, and the id
 * generator is passed in (as lib/zip.ts takes inflate) so tests stay pure.
 */

export type PersonKind = "photographer" | "model";
export const PERSON_KINDS: readonly PersonKind[] = ["photographer", "model"];

export type PersonRecord = {
  id: string;
  kind: PersonKind;
  name: string;
  /** Where they are based. */
  city: string | null;
  /** Full Instagram URL. */
  ig: string | null;
  /** Website or agency page. */
  link: string | null;
  /** The team-entered card (lib/photographerMeta). */
  card: unknown;
  deleted_at?: string | null;
  /** Newest removal wins when a removed person is brought back. */
  updated_at?: string | null;
};

export type LinkRecord = {
  id: string;
  reference_id: string;
  person_id: string;
  role: PersonKind;
};

/** The columns of a `references` row the tags are read from. */
export type CreditRow = {
  id: string;
  type: string | null;
  photographer: string | null;
  model: string | null;
  photographer_ig?: string | null;
  link?: string | null;
  location?: string | null;
  deleted_at?: string | null;
};

/** Which row type is a directory's own (lib/people.ts ownType). */
export type OwnTypes = Record<PersonKind, string>;

const NOT_A_NAME = new Set(["", "unknown", "n/a", "na", "none", "-", "?"]);

/** How a name is compared — trimmed and case-folded, as the directory always has. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export function isRealName(name: string | null | undefined): boolean {
  return !NOT_A_NAME.has(nameKey(name));
}

const SEP = /\s*[,;/]\s*/;

/**
 * The names a credit names. On a directory's own row the whole credit is the
 * person; anywhere else it may list several, split on , ; or /.
 */
export function creditNames(credit: string | null | undefined, ownRow: boolean): string[] {
  const whole = (credit ?? "").trim();
  if (!isRealName(whole)) return [];
  if (ownRow) return [whole];
  const parts = whole.split(SEP).map((s) => s.trim()).filter(isRealName);
  return parts.length > 1 ? [whole, ...parts] : [whole];
}

/**
 * A credit with one person's name swapped for their new one — used when a person
 * is renamed or merged, so the text on their images keeps agreeing with the
 * record. Only a whole credit, or a whole part of a listed one, is replaced:
 * renaming "Ana" never touches "Anastasia".
 */
export function renameInCredit(credit: string | null, oldName: string, newName: string): string | null {
  if (credit == null) return credit;
  const k = nameKey(oldName);
  if (!k) return credit;
  if (nameKey(credit) === k) return newName;
  const parts = credit.split(SEP);
  if (parts.length < 2 || !parts.some((p) => nameKey(p) === k)) return credit;
  return parts.map((p) => (nameKey(p) === k ? newName : p.trim())).join(", ");
}

function isInstagramUrl(u: string | null | undefined): boolean {
  return typeof u === "string" && /(^@|instagram\.com\/)/i.test(u.trim());
}

const clean = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The most common non-blank value, ties to the first seen. */
function mode(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, { n: number; first: number; v: string }>();
  values.forEach((raw, i) => {
    const v = clean(raw);
    if (!v) return;
    const k = v.toLowerCase();
    const c = counts.get(k);
    if (c) c.n += 1;
    else counts.set(k, { n: 1, first: i, v });
  });
  let best: { n: number; first: number; v: string } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n || (c.n === best.n && c.first < best.first)) best = c;
  return best?.v ?? null;
}

export type NewPerson = Omit<PersonRecord, "deleted_at" | "updated_at"> & { brand?: string };

export type SyncPlan = {
  /** People to insert — each already has the id the links below point at. */
  create: NewPerson[];
  /** Removed people a credit has brought back. */
  revive: string[];
  /** Tags to add. */
  add: { reference_id: string; person_id: string; role: PersonKind }[];
  /** Tags (by link id) the credit no longer supports. */
  drop: string[];
};

/**
 * What it takes to make the tags on `rows` agree with their credits.
 *
 *   rows        the rows to reconcile. A row in Trash is left exactly as it is,
 *               tags included, so restoring it brings everything back.
 *   people      every person of the brand, removed ones too (so a credit can
 *               bring one back instead of making a stranger with the same name).
 *   links       the live tags currently on those rows.
 *   legacyCards the old name-keyed settings maps, per kind — a person created
 *               here starts from the card the team already filled in for them.
 *
 * A new person's city, Instagram and site come from all of their own rows in
 * `rows`: the most common city, the first handle and link. Pure and idempotent:
 * planning again after applying a plan returns an empty plan.
 */
export function planPeopleSync(input: {
  rows: readonly CreditRow[];
  people: readonly PersonRecord[];
  links: readonly LinkRecord[];
  ownTypes: OwnTypes;
  newId: () => string;
  legacyCards?: Partial<Record<PersonKind, Record<string, unknown>>>;
}): SyncPlan {
  const { rows, people, links, ownTypes, newId, legacyCards } = input;
  const plan: SyncPlan = { create: [], revive: [], add: [], drop: [] };

  const live = new Map<string, string>(); // kind|key -> id
  const removed = new Map<string, PersonRecord>(); // kind|key -> newest removed
  const removedById = new Map<string, PersonRecord>();
  for (const p of people) {
    const k = `${p.kind}|${nameKey(p.name)}`;
    if (!p.deleted_at) live.set(k, p.id);
    else {
      removedById.set(p.id, p);
      const cur = removed.get(k);
      if (!cur || (p.deleted_at ?? "") > (cur.deleted_at ?? "")) removed.set(k, p);
    }
  }

  // A directory's own rows, by person — for a new person's city and links.
  const ownByName = new Map<string, CreditRow[]>();
  for (const r of rows) {
    if (r.deleted_at) continue;
    for (const kind of PERSON_KINDS) {
      if (r.type !== ownTypes[kind]) continue;
      const name = kind === "photographer" ? r.photographer : r.model;
      if (!isRealName(name)) continue;
      const k = `${kind}|${nameKey(name)}`;
      const list = ownByName.get(k) ?? [];
      list.push(r);
      ownByName.set(k, list);
    }
  }

  function personFor(kind: PersonKind, name: string, own: boolean): string | null {
    const k = `${kind}|${nameKey(name)}`;
    const have = live.get(k);
    if (have) return have;
    if (!own) return null;
    const back = removed.get(k);
    if (back) {
      plan.revive.push(back.id);
      live.set(k, back.id);
      return back.id;
    }
    const mine = ownByName.get(k) ?? [];
    const igs = mine.map((r) => (kind === "photographer" ? r.photographer_ig : isInstagramUrl(r.link) ? r.link : null));
    const sites = mine.map((r) => (isInstagramUrl(r.link) ? null : r.link));
    const p: NewPerson = {
      id: newId(),
      kind,
      name: name.trim(),
      city: mode(mine.map((r) => r.location)),
      ig: igs.map(clean).find(Boolean) ?? null,
      link: sites.map(clean).find(Boolean) ?? null,
      card: legacyCards?.[kind]?.[nameKey(name)] ?? {},
    };
    plan.create.push(p);
    live.set(k, p.id);
    return p.id;
  }

  // Everyone a directory row names exists before any tagging, so a Campaign image
  // read before the model row that introduces its model still gets her tag —
  // otherwise the result would depend on row order and take two runs to settle.
  for (const k of ownByName.keys()) {
    const [kind, ...rest] = k.split("|");
    const first = ownByName.get(k)![0];
    const name = kind === "photographer" ? first.photographer : first.model;
    if (rest.length && name) personFor(kind as PersonKind, name, true);
  }

  const linksOf = new Map<string, LinkRecord[]>(); // ref|role -> links
  for (const l of links) {
    const k = `${l.reference_id}|${l.role}`;
    const list = linksOf.get(k) ?? [];
    list.push(l);
    linksOf.set(k, list);
  }

  for (const r of rows) {
    if (r.deleted_at) continue;
    for (const role of PERSON_KINDS) {
      const own = r.type === ownTypes[role];
      const credit = role === "photographer" ? r.photographer : r.model;
      const want = new Set<string>();
      for (const n of creditNames(credit, own)) {
        const id = personFor(role, n, own);
        if (id) want.add(id);
      }
      const have = linksOf.get(`${r.id}|${role}`) ?? [];
      const named = new Set(creditNames(credit, own).map(nameKey));
      const kept = new Set<string>();
      for (const l of have) {
        // A tag to someone removed on purpose stays while the credit still names
        // them: it neither brings them back nor is lost, so a later Restore of the
        // person finds their pictures where they were.
        const gone = removedById.get(l.person_id);
        if (gone && named.has(nameKey(gone.name)) && !kept.has(l.person_id)) {
          kept.add(l.person_id);
          continue;
        }
        if (want.has(l.person_id) && !kept.has(l.person_id)) kept.add(l.person_id);
        else plan.drop.push(l.id); // no longer credited, or a duplicate tag
      }
      for (const id of want) if (!kept.has(id)) plan.add.push({ reference_id: r.id, person_id: id, role });
    }
  }
  return plan;
}

export function planIsEmpty(p: SyncPlan): boolean {
  return p.create.length + p.revive.length + p.add.length + p.drop.length === 0;
}

/** How many changes a plan makes — what Setup shows as "to fix". */
export function planSize(p: SyncPlan): number {
  return p.create.length + p.revive.length + p.add.length + p.drop.length;
}

// ---------------------------------------------------------------------------
// Tagging from a picture (people phase 3, 2026-11-02: "and phase 3"). A tag is
// added or taken off from the picture's own detail view, and the credit text is
// rewritten to match — so the typed credit and the tags never disagree, in
// either direction. The credit stays typeable because Archival is full of
// photographers who will never have a record ("Louis Faurer"), and a credit is
// how they are kept.
// ---------------------------------------------------------------------------

/** A credit with `name` added, unless it already names them. */
export function addToCredit(credit: string | null | undefined, name: string): string {
  const n = name.trim();
  const c = (credit ?? "").trim();
  if (!c) return n;
  if (creditNames(c, false).some((x) => nameKey(x) === nameKey(n))) return c;
  return `${c}, ${n}`;
}

/**
 * A credit with `name` taken out — the whole credit, or one part of a listed
 * one. Null when nothing is left. Never touches a longer name ("Ana" stays out
 * of "Anastasia").
 */
export function removeFromCredit(credit: string | null | undefined, name: string): string | null {
  const c = (credit ?? "").trim();
  const k = nameKey(name);
  if (!c || !k) return c || null;
  if (nameKey(c) === k) return null;
  const parts = c.split(SEP).map((p) => p.trim()).filter(Boolean);
  const left = parts.filter((p) => nameKey(p) !== k);
  if (left.length === parts.length) return c;
  return left.length ? left.join(", ") : null;
}

/**
 * Names a credit gives that nobody has a record for — offered on the picture as
 * "add to Photographers / Models", so a credited name becomes a person by one
 * deliberate click, never automatically.
 */
export function unrecordedNames(
  credit: string | null | undefined,
  ownRow: boolean,
  recorded: ReadonlySet<string>
): string[] {
  const names = creditNames(credit, ownRow);
  // A listed credit offers its parts, not the whole "Ana, Bea" string.
  const offer = names.length > 1 ? names.slice(1) : names;
  const seen = new Set<string>();
  return offer.filter((n) => {
    const k = nameKey(n);
    if (recorded.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
