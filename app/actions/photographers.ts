"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam, requireUser } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import { REFERENCES_BUCKET } from "@/lib/storage";
import {
  cardWithDefaults,
  mergeCard,
  readCard,
  type PhotographerMeta,
} from "@/lib/photographerMeta";
import { PEOPLE, isPeopleKind, instagramUrl, type PeopleKind } from "@/lib/people";
import { nameKey, renameInCredit, type PersonRecord } from "@/lib/peopleRecords";
import { syncPeopleLinks } from "@/lib/peopleDb";

// 2026-11-02: the directory is no longer extras-only. Tess asked for the deck's
// photographers in SSYNC and for "a space for potential models", so these writes
// now take a `kind` (photographer, the default, or model — see lib/people.ts) and
// are open to the team on this deploy. A talent still cannot write: requireTeam.
function cfg(kind: unknown) {
  return PEOPLE[isPeopleKind(kind) ? kind : "photographer"];
}

// Set the team-entered side of a person — group, role, notes, star, image order
// (Tess, 2026-08-17; the card moved onto the person's own record 2026-11-02,
// people phase 1). Read-modify-write of that one record's `card`, so an edit
// carries every field it did not come for. `personId` is what the directory now
// keys a person by; before phase 1 it was their lower-cased name.
export async function setPhotographerMeta(
  personId: string,
  patch: Partial<PhotographerMeta>,
  kind: PeopleKind = "photographer"
) {
  await requireTeam();
  const id = (personId ?? "").trim();
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("card").eq("id", id).maybeSingle();
  if (!data) return;
  await supabase
    .from("people")
    .update({ card: mergeCard((data as { card: unknown }).card, patch), updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(cfg(kind).href);
}

export type PersonFields = { name?: string; city?: string; ig?: string; link?: string };

// Rename someone, or set where they are based and their links (people phase 1,
// 2026-11-02: "you rename or merge them once"). A rename also rewrites the credit
// on every image tagged to them, so the text the team edits keeps agreeing with
// the record. Renaming to someone who already exists MERGES the two: the tags
// move to the person kept, their card fills in only what the kept card leaves
// blank, and the other record is removed (soft — it can be put back by hand).
// Ryan Marie Helfant's "(DP)" card is the case this was for.
export async function updatePerson(
  personId: string,
  fields: PersonFields,
  kind: PeopleKind = "photographer"
): Promise<{ ok: boolean; mergedInto?: string; error?: string }> {
  await requireTeam();
  const c = cfg(kind);
  const supabase = await createClient();
  const { data: me } = await supabase.from("people").select("*").eq("id", personId).maybeSingle();
  const person = me as (PersonRecord & { brand: string }) | null;
  if (!person) return { ok: false, error: "Not found." };
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {};
  if (fields.city !== undefined) patch.city = fields.city.trim() || null;
  if (fields.ig !== undefined) patch.ig = instagramUrl(fields.ig) || null;
  if (fields.link !== undefined) patch.link = fields.link.trim() || null;

  const newName = (fields.name ?? person.name).trim();
  if (!newName) return { ok: false, error: "A name can't be blank." };
  const renamed = newName !== person.name;

  // Someone else already has this name: merge into them.
  let target = person;
  if (renamed && nameKey(newName) !== nameKey(person.name)) {
    const { data: same } = await supabase
      .from("people")
      .select("*")
      .eq("brand", person.brand)
      .eq("kind", person.kind)
      .is("deleted_at", null)
      .neq("id", person.id);
    const other = ((same ?? []) as (PersonRecord & { brand: string })[]).find((p) => nameKey(p.name) === nameKey(newName));
    if (other) target = other;
  }

  // The images tagged to this person, for the credit rewrite.
  const { data: tagRows } = await supabase
    .from("reference_people")
    .select("id,reference_id")
    .eq("person_id", person.id)
    .is("deleted_at", null);
  const tags = (tagRows ?? []) as { id: string; reference_id: string }[];

  if (target.id !== person.id) {
    // Move the tags, fill the kept card's blanks, retire this record.
    const { data: theirs } = await supabase
      .from("reference_people")
      .select("reference_id")
      .eq("person_id", target.id)
      .is("deleted_at", null);
    const have = new Set(((theirs ?? []) as { reference_id: string }[]).map((t) => t.reference_id));
    const moving = tags.filter((t) => !have.has(t.reference_id));
    if (moving.length) {
      await supabase
        .from("reference_people")
        .insert(moving.map((t) => ({ brand: person.brand, reference_id: t.reference_id, person_id: target.id, role: kind })));
    }
    if (tags.length) await supabase.from("reference_people").update({ deleted_at: now }).in("id", tags.map((t) => t.id));
    const mine = readCard(person.card);
    const merged = cardWithDefaults(target.card, { ...mine, imageOrder: [...readCard(target.card).imageOrder, ...mine.imageOrder] });
    await supabase
      .from("people")
      .update({
        card: merged,
        city: target.city || (patch.city as string | null) || person.city,
        ig: target.ig || (patch.ig as string | null) || person.ig,
        link: target.link || (patch.link as string | null) || person.link,
        updated_at: now,
      })
      .eq("id", target.id);
    await supabase.from("people").update({ deleted_at: now, updated_at: now }).eq("id", person.id);
  } else {
    if (renamed) patch.name = newName;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("people").update({ ...patch, updated_at: now }).eq("id", person.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  if (renamed && tags.length) {
    const col = kind === "model" ? "model" : "photographer";
    const { data: rows } = await supabase.from("references").select(`id,${col}`).in("id", tags.map((t) => t.reference_id));
    for (const r of (rows ?? []) as Record<string, string | null>[]) {
      const next = renameInCredit(r[col], person.name, target.id === person.id ? newName : target.name);
      if (next !== r[col]) await supabase.from("references").update({ [col]: next }).eq("id", r.id as string);
    }
  }

  revalidatePath(c.href);
  revalidatePath("/editorial");
  revalidatePath("/archival");
  return target.id === person.id ? { ok: true } : { ok: true, mergedInto: target.id };
}

// Remove one image off a photographer's profile (Tess, 2026-08-17: "allow to x
// out image easily"). Soft delete, so it goes to Trash and can be restored — the
// same recoverable path as everywhere else, not a hard delete.
export async function removePhotographerImage(id: string, kind: PeopleKind = "photographer") {
  await requireTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("references")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(cfg(kind).href);
  revalidatePath("/trash");
}

// Save selected photographer images into the Campaign library (Tess, 2026-08-19:
// "from the photographer profile, you can specifically select images you want
// saved into the campaign library").
//
// It makes a COPY, not a move: each chosen roster row is duplicated as an
// 'editorial' row pointing at the same image, crediting the same photographer.
// A copy rather than a flip so the two are decoupled (Tess, 2026-08-19: "is
// there a way it doesn't have to show twice ... add whatever guardrails") —
// deleting the campaign copy later never touches the photographer's roster
// image, and the profile de-dupes by image so it still shows once. Idempotent:
// an image already in Campaign is skipped, so saving twice can't pile up copies.
export async function saveImagesToCampaign(ids: string[]): Promise<{ saved: number }> {
  await requireTeam();
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return { saved: 0 };
  const supabase = await createClient();
  const brand = await activeBrand();

  const [{ data: rows }, { data: existing }] = await Promise.all([
    supabase.from("references").select("*").eq("brand", brand).eq("type", "roster").in("id", clean),
    supabase
      .from("references")
      .select("image_url")
      .eq("brand", brand)
      .eq("type", "editorial")
      .is("deleted_at", null),
  ]);
  const have = new Set((existing ?? []).map((e) => (e as { image_url: string | null }).image_url).filter(Boolean));

  // Copy only the image + credit fields; never id / created_at / deleted_at, and
  // never a row whose image is already in Campaign.
  const copies = (rows ?? [])
    .filter((r) => {
      const u = (r as { image_url: string | null }).image_url;
      return u && !have.has(u);
    })
    .map((r) => {
      const s = r as Record<string, unknown>;
      return {
        brand,
        type: "editorial",
        designer: s.designer ?? "",
        photographer: s.photographer ?? null,
        photographer_ig: s.photographer_ig ?? null,
        location: s.location ?? null,
        link: s.link ?? null,
        year: s.year ?? null,
        season: s.season ?? null,
        model: s.model ?? null,
        image: s.image ?? null,
        thumb: s.thumb ?? null,
        image_url: s.image_url ?? null,
        thumb_url: s.thumb_url ?? null,
        extra_images: s.extra_images ?? null,
        notes: s.notes ?? null,
      };
    });
  if (copies.length === 0) return { saved: 0 };
  const { data: made } = await supabase.from("references").insert(copies).select("id");
  // The copy carries the same credit, so it is tagged to the same person and the
  // profile shows its "In campaign" badge.
  await syncPeopleLinks(supabase, brand, ((made ?? []) as { id: string }[]).map((r) => r.id));
  revalidatePath("/photographers");
  revalidatePath("/editorial");
  return { saved: copies.length };
}

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "jpg";
}

// Attach a photographer's own work to their profile (Tess, 2026-08-17: "upload
// 3-5 images per photographer ... work that look most similar to" the at-home look).
// I can't source those images from here — Instagram blocks fetching and I have no
// write access to the storage bucket — so this is the durable in-app path
// instead: the team uploads the shots that actually feel at-home and this
// stores them properly.
//
// Each image becomes its own `references` row, typed 'roster' (not 'editorial',
// so it never leaks onto the Campaign grid) and carrying the photographer's name
// + city. That is exactly what the directory groups on, so the images gather
// under the right person, place their card in the right city, and give an
// otherwise-blank roster card a real cover — same shape as the roster rows
// already there.
//
// Since people phase 1 (2026-11-02) the profile says WHO by the person's id, and
// the rows take that person's current name and base city, then are tagged to
// them straight away.
export async function addPhotographerImages(
  personId: string,
  formData: FormData,
  kind: PeopleKind = "photographer"
): Promise<{ ok: boolean; added: number; errors: string[] }> {
  await requireTeam();
  const c = cfg(kind);
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("name,city").eq("id", personId).maybeSingle();
  const p = data as { name: string; city: string | null } | null;
  if (!p?.name) return { ok: false, added: 0, errors: [`No ${c.noun}.`] };
  const { ids, errors } = await uploadPersonImages(c.kind, p.name, p.city ?? "", formData, {});
  if (ids.length === 0 && errors.length === 0) return { ok: false, added: 0, errors: ["No image files provided."] };
  if (ids.length > 0) {
    await syncPeopleLinks(supabase, await activeBrand(), ids);
    revalidatePath(c.href);
  }
  return { ok: ids.length > 0, added: ids.length, errors };
}

// The row a directory writes for one of its own people. A photographer's row is
// a 'roster' row credited in `photographer`; a model's is a 'model' row named in
// `model`, with `photographer` left for whoever took the picture. `designer` is
// NOT NULL and means the label of a shoot, which neither has — so it is empty,
// same as the roster rows have always been.
function personRow(kind: PeopleKind, name: string, location: string, extra: Record<string, unknown>) {
  const base = { type: PEOPLE[kind].ownType, designer: "", location: location || null, ...extra };
  return kind === "model" ? { ...base, model: name } : { ...base, photographer: name };
}

// Upload each image to storage and insert one row per image for this person.
// Shared by "+ Add images" on a profile and by "+ Add" for a new person.
async function uploadPersonImages(
  kind: PeopleKind,
  name: string,
  location: string,
  formData: FormData,
  extra: Record<string, unknown>
): Promise<{ ids: string[]; errors: string[] }> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/"));
  if (files.length === 0) return { ids: [], errors: [] };

  const supabase = await createClient();
  const brand = await activeBrand();
  const user = await requireUser();
  const createdBy = user?.name || user?.email || null;

  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (isOversize(file.size)) {
      errors.push(oversizeError(file.name, file.size));
      continue;
    }
    try {
      const path = `${crypto.randomUUID()}/full.${extFor(file.type)}`;
      const { error: upErr } = await supabase.storage
        .from(REFERENCES_BUCKET)
        .upload(path, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type || "image/jpeg",
          upsert: false,
          cacheControl: "31536000",
        });
      if (upErr) {
        errors.push(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) {
        rows.push({
          ...personRow(kind, name, location, extra),
          brand,
          created_by: createdBy,
          image_url: pub.publicUrl,
          thumb_url: pub.publicUrl,
        });
      }
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }

  if (rows.length > 0) {
    const { data, error } = await supabase.from("references").insert(rows).select("id");
    if (error) return { ids: [], errors: [...errors, error.message] };
    return { ids: ((data ?? []) as { id: string }[]).map((r) => r.id), errors };
  }
  return { ids: [], errors };
}

export type NewPerson = {
  name: string;
  location?: string;
  /** Instagram handle or URL. */
  ig?: string;
  /** Website or agency page. */
  link?: string;
} & Partial<Pick<PhotographerMeta, "group" | "role" | "age" | "agency" | "pastWork" | "notes" | "photo" | "video">>;

// Add someone to a directory by hand (Tess, 2026-11-02: "create a space for
// potential models to be added"). Until now a person could only appear by being
// credited on a campaign image or by a roster row written from outside the app.
//
// With photos, each becomes a row under their name; without, one image-less row
// holds the name, city and links, which is all a card needs — it shows initials
// until a picture is added. The typed facts go onto their card.
export async function addPerson(
  kind: PeopleKind,
  person: NewPerson,
  formData: FormData
): Promise<{ ok: boolean; added: number; errors: string[] }> {
  await requireTeam();
  const c = cfg(kind);
  const name = (person?.name ?? "").trim();
  if (!name) return { ok: false, added: 0, errors: ["Add a name first."] };
  const location = (person.location ?? "").trim();

  // Where the links go: a photographer's Instagram has its own column; a model
  // row's photographer_ig would mean the photo credit's, so a model's Instagram
  // rides in link (see lib/people.ts creditFor). Both also go on the person's
  // record, which is where the directory reads them first.
  const ig = instagramUrl(person.ig);
  const site = (person.link ?? "").trim();
  const extra: Record<string, unknown> =
    kind === "model"
      ? { link: ig || site || null }
      : { photographer_ig: ig || null, link: site || null };

  const supabase = await createClient();
  const brand = await activeBrand();
  const user = await requireUser();
  const by = user?.name || user?.email || null;
  const now = new Date().toISOString();

  // The card from the form. Since people phase 1 the person is a record of their
  // own: found by name (case aside) if they are already there — then the form only
  // fills what is blank, so adding pictures for someone never wipes their notes —
  // or brought back if they were removed, or created.
  const card: Partial<PhotographerMeta> = {
    group: person.group?.trim() ?? "",
    role: person.role?.trim() ?? "",
    age: person.age?.trim() ?? "",
    agency: person.agency?.trim() ?? "",
    pastWork: person.pastWork?.trim() ?? "",
    notes: person.notes?.trim() ?? "",
    ...(person.photo != null ? { photo: !!person.photo } : {}),
    ...(person.video != null ? { video: !!person.video } : {}),
  };
  const { data: named } = await supabase
    .from("people")
    .select("*")
    .eq("brand", brand)
    .eq("kind", c.kind)
    .order("updated_at", { ascending: false, nullsFirst: false });
  const same = ((named ?? []) as PersonRecord[]).filter((p) => nameKey(p.name) === nameKey(name));
  const found = same.find((p) => !p.deleted_at) ?? same[0] ?? null;
  if (found) {
    const { error } = await supabase
      .from("people")
      .update({
        deleted_at: null,
        city: found.city || location || null,
        ig: found.ig || ig || null,
        link: found.link || site || null,
        card: cardWithDefaults(found.card, card),
        updated_at: now,
      })
      .eq("id", found.id);
    if (error) return { ok: false, added: 0, errors: [error.message] };
  } else {
    const { error } = await supabase.from("people").insert({
      brand,
      kind: c.kind,
      name,
      city: location || null,
      ig: ig || null,
      link: site || null,
      card: mergeCard({}, card),
      created_by: by,
    });
    if (error) return { ok: false, added: 0, errors: [error.message] };
  }

  const errors: string[] = [];
  const up = await uploadPersonImages(c.kind, name, location, formData, extra);
  const ids = [...up.ids];
  errors.push(...up.errors);
  if (ids.length === 0) {
    // No pictures: one image-less row still carries them, so the two-click
    // Remove has something to send to Trash and Restore something to bring back.
    const { data, error } = await supabase
      .from("references")
      .insert({ ...personRow(c.kind, name, location, extra), brand, created_by: by })
      .select("id");
    if (error) return { ok: false, added: 0, errors: [...errors, error.message] };
    ids.push(...((data ?? []) as { id: string }[]).map((r) => r.id));
  }
  await syncPeopleLinks(supabase, brand, ids, { by });

  revalidatePath(c.href);
  return { ok: true, added: ids.length, errors };
}

// Take someone out of a directory (the two-click Remove on their profile). Soft
// delete only: their record is marked removed and the directory's OWN rows tagged
// to them go to Trash — a photographer's Campaign pictures stay on Campaign. The
// card stays on the record, and restoring any of those rows from Trash brings
// the person back with it (lib/peopleRecords: a removed person is revived, not
// re-made). People phase 1, 2026-11-02 — before, this matched rows by name.
export async function removePerson(kind: PeopleKind, personId: string): Promise<{ removed: number }> {
  await requireTeam();
  const c = cfg(kind);
  if (!personId) return { removed: 0 };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: tags } = await supabase
    .from("reference_people")
    .select("reference_id")
    .eq("person_id", personId)
    .is("deleted_at", null);
  const refIds = ((tags ?? []) as { reference_id: string }[]).map((t) => t.reference_id);
  let removed = 0;
  if (refIds.length) {
    const { data } = await supabase
      .from("references")
      .update({ deleted_at: now })
      .in("id", refIds)
      .eq("type", c.ownType)
      .is("deleted_at", null)
      .select("id");
    removed = (data ?? []).length;
  }
  await supabase.from("people").update({ deleted_at: now, updated_at: now }).eq("id", personId);
  revalidatePath(c.href);
  revalidatePath("/trash");
  return { removed };
}
