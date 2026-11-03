// The database side of people records (2026-11-02, people phase 1). The rule —
// which credit tags whom, and when a record is created — is lib/peopleRecords.ts
// and is tested there; this file only reads what it needs, asks, and writes.
//
// Every write that can change a credit (an upload, an edit, a bulk edit, a
// directory add, a seed, a restore) calls syncPeopleLinks for the rows it
// touched. A failure here is logged and swallowed: the image write the person
// asked for has already succeeded, and Setup → Imports → "People records" (which
// runs the same sync over everything) is how a missed tag is caught up.

import { createClient } from "@/lib/supabase/server";
import { PEOPLE, type PeopleKind } from "@/lib/people";
import {
  planPeopleSync,
  type CreditRow,
  type LinkRecord,
  type PersonRecord,
  type SyncPlan,
} from "@/lib/peopleRecords";

type Supa = Awaited<ReturnType<typeof createClient>>;

export const OWN_TYPES = { photographer: PEOPLE.photographer.ownType, model: PEOPLE.model.ownType };
const ROW_COLS = "id,type,photographer,model,photographer_ig,link,location,deleted_at";
const PERSON_COLS = "id,kind,name,city,ig,link,card,deleted_at,updated_at";
const LINK_COLS = "id,reference_id,person_id,role";
const PAGE = 1000;
const CHUNK = 150; // ids per `in` filter — keeps the request URL well under limits

// Page past PostgREST's 1,000-row cap.
async function readPaged<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/** Every person of the brand, removed ones included. */
export async function readPeople(supabase: Supa, brand: string): Promise<PersonRecord[]> {
  return readPaged<PersonRecord>((from, to) =>
    supabase.from("people").select(PERSON_COLS).eq("brand", brand).order("created_at").range(from, to)
  );
}

async function readLinksFor(supabase: Supa, brand: string, refIds: string[] | "all"): Promise<LinkRecord[]> {
  if (refIds === "all") {
    return readPaged<LinkRecord>((from, to) =>
      supabase.from("reference_people").select(LINK_COLS).eq("brand", brand).is("deleted_at", null).order("id").range(from, to)
    );
  }
  const out: LinkRecord[] = [];
  for (const c of chunks(refIds)) {
    const { data, error } = await supabase.from("reference_people").select(LINK_COLS).in("reference_id", c).is("deleted_at", null);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as LinkRecord[]));
  }
  return out;
}

async function readRows(supabase: Supa, brand: string, refIds: string[] | "all"): Promise<CreditRow[]> {
  if (refIds === "all") {
    return readPaged<CreditRow>((from, to) =>
      supabase.from("references").select(ROW_COLS).eq("brand", brand).is("deleted_at", null).order("id").range(from, to)
    );
  }
  const out: CreditRow[] = [];
  for (const c of chunks(refIds)) {
    const { data, error } = await supabase.from("references").select(ROW_COLS).in("id", c);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as CreditRow[]));
  }
  return out;
}

// The old name-keyed settings maps — a person created by a sync starts from the
// card the team already filled in under their name.
async function readLegacyCards(supabase: Supa) {
  const { data } = await supabase
    .from("settings")
    .select("key,value")
    .in("key", [PEOPLE.photographer.metaKey, PEOPLE.model.metaKey]);
  const rows = (data ?? []) as { key: string; value: unknown }[];
  const map = (k: string) => (rows.find((r) => r.key === k)?.value ?? {}) as Record<string, unknown>;
  return { photographer: map(PEOPLE.photographer.metaKey), model: map(PEOPLE.model.metaKey) };
}

async function planFor(supabase: Supa, brand: string, refIds: string[] | "all"): Promise<SyncPlan> {
  const [rows, people, links, legacyCards] = await Promise.all([
    readRows(supabase, brand, refIds),
    readPeople(supabase, brand),
    readLinksFor(supabase, brand, refIds),
    readLegacyCards(supabase),
  ]);
  return planPeopleSync({ rows, people, links, ownTypes: OWN_TYPES, newId: () => crypto.randomUUID(), legacyCards });
}

async function applyPlan(supabase: Supa, brand: string, plan: SyncPlan, by: string | null): Promise<void> {
  const now = new Date().toISOString();
  if (plan.create.length) {
    const { error } = await supabase
      .from("people")
      .insert(plan.create.map((p) => ({ ...p, brand, created_by: by })));
    if (error) throw Object.assign(new Error(error.message), { code: (error as { code?: string }).code });
  }
  if (plan.revive.length) {
    const { error } = await supabase.from("people").update({ deleted_at: null, updated_at: now }).in("id", plan.revive);
    if (error) throw new Error(error.message);
  }
  for (const c of chunks(plan.add)) {
    const { error } = await supabase.from("reference_people").insert(c.map((l) => ({ ...l, brand })));
    if (error) throw new Error(error.message);
  }
  for (const c of chunks(plan.drop)) {
    const { error } = await supabase.from("reference_people").update({ deleted_at: now }).in("id", c);
    if (error) throw new Error(error.message);
  }
}

/**
 * Make the tags on these rows (or on every live row of the brand) agree with
 * their credits. Returns the plan that was applied. Two people saving at once
 * can both try to create the same person; the unique index refuses the second,
 * which re-reads and plans again once.
 */
export async function syncPeopleLinks(
  supabase: Supa,
  brand: string,
  refIds: string[] | "all",
  opts: { by?: string | null; quiet?: boolean } = {}
): Promise<SyncPlan | null> {
  if (refIds !== "all" && refIds.length === 0) return null;
  try {
    let plan = await planFor(supabase, brand, refIds);
    try {
      await applyPlan(supabase, brand, plan, opts.by ?? null);
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
      plan = await planFor(supabase, brand, refIds);
      await applyPlan(supabase, brand, plan, opts.by ?? null);
    }
    return plan;
  } catch (e) {
    if (opts.quiet === false) throw e;
    console.error("people sync failed", e);
    return null;
  }
}

/** What a full sync would change, without changing it — for Setup. */
export async function previewPeopleSync(supabase: Supa, brand: string): Promise<SyncPlan> {
  return planFor(supabase, brand, "all");
}

/** A directory's people, their live tags, and the tagged rows (newest first). */
export async function loadPeopleDirectory<R extends { id: string; created_at: string | null }>(
  supabase: Supa,
  brand: string,
  kind: PeopleKind
): Promise<{ people: PersonRecord[]; links: { reference_id: string; person_id: string }[]; refs: R[] }> {
  const [people, links] = await Promise.all([
    readPaged<PersonRecord>((from, to) =>
      supabase
        .from("people")
        .select(PERSON_COLS)
        .eq("brand", brand)
        .eq("kind", kind)
        .is("deleted_at", null)
        .order("name")
        .range(from, to)
    ),
    readPaged<LinkRecord>((from, to) =>
      supabase
        .from("reference_people")
        .select(LINK_COLS)
        .eq("brand", brand)
        .eq("role", kind)
        .is("deleted_at", null)
        .order("id")
        .range(from, to)
    ),
  ]);
  const live = new Set(people.map((p) => p.id));
  const mine = links.filter((l) => live.has(l.person_id));
  const refIds = Array.from(new Set(mine.map((l) => l.reference_id)));
  const refs: R[] = [];
  for (const c of chunks(refIds)) {
    const { data, error } = await supabase.from("references").select("*").in("id", c).is("deleted_at", null);
    if (error) throw new Error(error.message);
    refs.push(...((data ?? []) as R[]));
  }
  refs.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return { people, links: mine.map((l) => ({ reference_id: l.reference_id, person_id: l.person_id })), refs };
}
