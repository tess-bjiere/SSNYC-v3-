"use server";

// Tagging people from a picture — people phase 3 (Tess, 2026-11-02: "and phase
// 3"). The detail view of any picture (References, Campaign, Archival, a
// profile) shows the photographers and models tagged on it, and the team can tag
// someone from the directory, take a tag off, or turn a credited name into a
// person.
//
// A tag and the typed credit are kept in step BOTH ways: tagging here rewrites
// the credit (lib/peopleRecords addToCredit / removeFromCredit) and then runs the
// one rule that turns credits into tags (syncPeopleLinks). So there is never a
// tag the credit does not explain, and editing the credit in the Edit form still
// moves the tags as it did in phase 1. The credit stays typeable on purpose:
// Archival credits photographers who will never be in the directory.
//
// A picture that is a person's OWN (a photographer's roster row, a model's model
// row) belongs to exactly one person in that role: tagging someone else there
// moves it to them, and its tag cannot simply be removed — that would leave a
// picture on no page at all.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, requireTeam } from "@/lib/access";
import { MOCK } from "@/lib/mock";
import {
  addToCredit,
  isRealName,
  nameKey,
  removeFromCredit,
  unrecordedNames,
  type PersonKind,
} from "@/lib/peopleRecords";
import { OWN_TYPES, syncPeopleLinks } from "@/lib/peopleDb";

export type TaggedPerson = { id: string; name: string; kind: PersonKind };

export type ImagePeople = {
  tags: TaggedPerson[];
  /** Everyone who can be tagged, for the picker. */
  people: TaggedPerson[];
  /** Credited names with no record, offered as "add to the directory". */
  suggestions: { kind: PersonKind; name: string }[];
  canEdit: boolean;
  /** The role this picture is someone's own in, if any. */
  ownRole: PersonKind | null;
  photographer: string | null;
  model: string | null;
  error?: string;
};

const EMPTY: ImagePeople = {
  tags: [],
  people: [],
  suggestions: [],
  canEdit: false,
  ownRole: null,
  photographer: null,
  model: null,
};

type Row = { id: string; brand: string; type: string | null; photographer: string | null; model: string | null };
type Supa = Awaited<ReturnType<typeof createClient>>;

const col = (kind: PersonKind) => (kind === "photographer" ? "photographer" : "model");

function ownRoleOf(type: string | null): PersonKind | null {
  if (type === OWN_TYPES.photographer) return "photographer";
  if (type === OWN_TYPES.model) return "model";
  return null;
}

async function readRow(supabase: Supa, refId: string): Promise<Row | null> {
  const { data } = await supabase
    .from("references")
    .select("id,brand,type,photographer,model")
    .eq("id", refId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function payload(supabase: Supa, row: Row, canEdit: boolean): Promise<ImagePeople> {
  const [{ data: tagRows }, { data: peopleRows }] = await Promise.all([
    supabase
      .from("reference_people")
      .select("person_id,role")
      .eq("reference_id", row.id)
      .is("deleted_at", null),
    supabase
      .from("people")
      .select("id,name,kind")
      .eq("brand", row.brand)
      .is("deleted_at", null)
      .order("name"),
  ]);
  const people = (peopleRows ?? []) as TaggedPerson[];
  const byId = new Map(people.map((p) => [p.id, p]));
  const tags = ((tagRows ?? []) as { person_id: string; role: PersonKind }[])
    .map((t) => byId.get(t.person_id))
    .filter((p): p is TaggedPerson => !!p);
  const ownRole = ownRoleOf(row.type);
  const suggestions: ImagePeople["suggestions"] = [];
  for (const kind of ["photographer", "model"] as PersonKind[]) {
    const recorded = new Set(people.filter((p) => p.kind === kind).map((p) => nameKey(p.name)));
    for (const name of unrecordedNames(row[col(kind)], ownRole === kind, recorded)) suggestions.push({ kind, name });
  }
  return { tags, people, suggestions, canEdit, ownRole, photographer: row.photographer, model: row.model };
}

function revalidateAll() {
  for (const p of ["/photographers", "/models", "/editorial", "/archival", "/library"]) revalidatePath(p);
}

/** Who is tagged on a picture, and who could be. */
export async function getImagePeople(refId: string): Promise<ImagePeople> {
  if (MOCK || !refId) return EMPTY;
  const user = await getSessionUser();
  if (!user) return EMPTY;
  try {
    const supabase = await createClient();
    const row = await readRow(supabase, refId);
    if (!row) return EMPTY;
    return await payload(supabase, row, user.role === "team");
  } catch {
    // Before db/p30 the tables are not there; the card simply shows its credits.
    return EMPTY;
  }
}

// Write a new credit for one role and let the rule re-derive the tags.
async function writeCredit(supabase: Supa, row: Row, kind: PersonKind, credit: string | null): Promise<Row> {
  const next = { ...row, [col(kind)]: credit };
  if (credit !== row[col(kind)]) {
    await supabase.from("references").update({ [col(kind)]: credit }).eq("id", row.id);
  }
  await syncPeopleLinks(supabase, row.brand, [row.id]);
  return next;
}

async function tagOn(supabase: Supa, row: Row, person: TaggedPerson): Promise<Row> {
  const kind = person.kind;
  // Someone's own picture belongs to one person in that role: tagging another
  // person moves it to them.
  const credit = ownRoleOf(row.type) === kind ? person.name : addToCredit(row[col(kind)], person.name);
  return writeCredit(supabase, row, kind, credit);
}

/** Tag someone already in the directory on this picture. */
export async function tagImage(refId: string, personId: string): Promise<ImagePeople> {
  await requireTeam();
  const supabase = await createClient();
  const row = await readRow(supabase, refId);
  const { data: p } = await supabase.from("people").select("id,name,kind,brand").eq("id", personId).is("deleted_at", null).maybeSingle();
  const person = p as (TaggedPerson & { brand: string }) | null;
  if (!row || !person || person.brand !== row.brand) return { ...EMPTY, error: "Couldn't find that person." };
  const next = await tagOn(supabase, row, person);
  revalidateAll();
  return payload(supabase, next, true);
}

/** Take a tag off this picture (and their name out of its credit). */
export async function untagImage(refId: string, personId: string): Promise<ImagePeople> {
  await requireTeam();
  const supabase = await createClient();
  const row = await readRow(supabase, refId);
  const { data: p } = await supabase.from("people").select("id,name,kind").eq("id", personId).maybeSingle();
  const person = p as TaggedPerson | null;
  if (!row || !person) return { ...EMPTY, error: "Couldn't find that person." };
  if (ownRoleOf(row.type) === person.kind) {
    return {
      ...(await payload(supabase, row, true)),
      error: `This is ${person.name}'s own picture — tag someone else to move it to them.`,
    };
  }
  const next = await writeCredit(supabase, row, person.kind, removeFromCredit(row[col(person.kind)], person.name));
  revalidateAll();
  return payload(supabase, next, true);
}

/**
 * Put a name into Photographers or Models from a picture and tag them on it —
 * the one deliberate click that turns a credited name into a person. Someone
 * already there (case aside) is reused; someone removed is brought back with
 * their card.
 */
export async function addPersonFromImage(refId: string, kind: PersonKind, rawName: string): Promise<ImagePeople> {
  const user = await requireTeam();
  const name = (rawName ?? "").trim();
  if (!isRealName(name)) return { ...EMPTY, error: "Add a name first." };
  if (kind !== "photographer" && kind !== "model") return { ...EMPTY, error: "Unknown directory." };
  const supabase = await createClient();
  const row = await readRow(supabase, refId);
  if (!row) return { ...EMPTY, error: "Couldn't find that picture." };

  const { data: same } = await supabase
    .from("people")
    .select("id,name,kind,deleted_at,updated_at")
    .eq("brand", row.brand)
    .eq("kind", kind)
    .order("updated_at", { ascending: false });
  const matches = ((same ?? []) as (TaggedPerson & { deleted_at: string | null })[]).filter(
    (p) => nameKey(p.name) === nameKey(name)
  );
  let person: TaggedPerson | null = matches.find((p) => !p.deleted_at) ?? null;
  if (!person && matches[0]) {
    await supabase.from("people").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", matches[0].id);
    person = matches[0];
  }
  if (!person) {
    const { data: made, error } = await supabase
      .from("people")
      .insert({ brand: row.brand, kind, name, created_by: user.name || user.email || null })
      .select("id,name,kind")
      .single();
    if (error || !made) return { ...(await payload(supabase, row, true)), error: error?.message ?? "Couldn't add." };
    person = made as TaggedPerson;
  }
  const next = await tagOn(supabase, row, person);
  revalidateAll();
  return payload(supabase, next, true);
}
