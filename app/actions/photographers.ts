"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam, requireUser } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import { REFERENCES_BUCKET } from "@/lib/storage";
import {
  photographerKey,
  withPhotographerMeta,
  type PhotographerMeta,
} from "@/lib/photographerMeta";
import { PEOPLE, isPeopleKind, instagramUrl, type PeopleKind } from "@/lib/people";

// 2026-11-02: the directory is no longer extras-only. Tess asked for the deck's
// photographers in SSYNC and for "a space for potential models", so these writes
// now take a `kind` (photographer, the default, or model — see lib/people.ts) and
// are open to the team on this deploy. A talent still cannot write: requireTeam.
function cfg(kind: unknown) {
  return PEOPLE[isPeopleKind(kind) ? kind : "photographer"];
}

// Set the team-entered side of a photographer — tier, video/directs, clients
// (Tess, 2026-08-17). Stored in the shared `settings` jsonb under one key, keyed
// by the photographer's normalised name, read-modify-write so one edit never
// disturbs another person's card. No table, no migration.
export async function setPhotographerMeta(
  nameKey: string,
  patch: Partial<PhotographerMeta>,
  kind: PeopleKind = "photographer"
) {
  await requireTeam();
  const key = (nameKey ?? "").trim();
  if (!key) return;
  const c = cfg(kind);

  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", c.metaKey)
    .maybeSingle();

  const next = withPhotographerMeta(data?.value ?? {}, key, patch);
  await supabase
    .from("settings")
    .upsert({ key: c.metaKey, value: next, updated_at: new Date().toISOString() });

  revalidatePath(c.href);
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
  await supabase.from("references").insert(copies);
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
// otherwise-blank roster card a real cover — no photographer table, same shape as
// the 185 roster rows already there.
export async function addPhotographerImages(
  photographer: string,
  location: string,
  formData: FormData,
  kind: PeopleKind = "photographer"
): Promise<{ ok: boolean; added: number; errors: string[] }> {
  await requireTeam();
  const name = (photographer ?? "").trim();
  const c = cfg(kind);
  if (!name) return { ok: false, added: 0, errors: [`No ${c.noun}.`] };
  const { rows, errors } = await uploadPersonImages(c.kind, name, (location ?? "").trim(), formData, {});
  if (rows === 0 && errors.length === 0) return { ok: false, added: 0, errors: ["No image files provided."] };
  if (rows > 0) revalidatePath(c.href);
  return { ok: rows > 0, added: rows, errors };
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
): Promise<{ rows: number; errors: string[] }> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/"));
  if (files.length === 0) return { rows: 0, errors: [] };

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
    const { error } = await supabase.from("references").insert(rows);
    if (error) return { rows: 0, errors: [...errors, error.message] };
  }
  return { rows: rows.length, errors };
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
  // rides in link (see lib/people.ts creditFor) and a site goes into notes.
  const ig = instagramUrl(person.ig);
  const site = (person.link ?? "").trim();
  const extra: Record<string, unknown> =
    kind === "model"
      ? { link: ig || site || null }
      : { photographer_ig: ig || null, link: site || null };

  const supabase = await createClient();
  let added = 0;
  const errors: string[] = [];
  const up = await uploadPersonImages(c.kind, name, location, formData, extra);
  added += up.rows;
  errors.push(...up.errors);
  if (added === 0) {
    const brand = await activeBrand();
    const user = await requireUser();
    const { error } = await supabase.from("references").insert({
      ...personRow(c.kind, name, location, extra),
      brand,
      created_by: user?.name || user?.email || null,
    });
    if (error) return { ok: false, added: 0, errors: [...errors, error.message] };
    added = 1;
  }

  const notes = [person.notes?.trim(), kind === "model" && ig && site ? site : ""].filter(Boolean).join("\n\n");
  const patch: Partial<PhotographerMeta> = {
    group: person.group?.trim() ?? "",
    role: person.role?.trim() ?? "",
    age: person.age?.trim() ?? "",
    agency: person.agency?.trim() ?? "",
    pastWork: person.pastWork?.trim() ?? "",
    notes,
    ...(person.photo != null ? { photo: !!person.photo } : {}),
    ...(person.video != null ? { video: !!person.video } : {}),
  };
  const { data } = await supabase.from("settings").select("value").eq("key", c.metaKey).maybeSingle();
  const next = withPhotographerMeta(data?.value ?? {}, name, patch);
  await supabase.from("settings").upsert({ key: c.metaKey, value: next, updated_at: new Date().toISOString() });

  revalidatePath(c.href);
  return { ok: true, added, errors };
}

// Take someone out of a directory (the two-click Remove on their profile). Soft
// delete only — every row goes to Trash and can be restored — and only the
// directory's OWN rows: a photographer's campaign images stay on Campaign, so a
// photographer credited there keeps a card built from those. Their card (notes,
// group…) is left in settings, so restoring the rows brings everything back.
export async function removePerson(kind: PeopleKind, name: string): Promise<{ removed: number }> {
  await requireTeam();
  const c = cfg(kind);
  const key = photographerKey(name);
  if (!key) return { removed: 0 };
  const supabase = await createClient();
  const brand = await activeBrand();
  const nameCol = c.kind === "model" ? "model" : "photographer";
  const { data } = await supabase
    .from("references")
    .select(`id,${nameCol}`)
    .eq("brand", brand)
    .eq("type", c.ownType)
    .is("deleted_at", null);
  const ids = ((data ?? []) as Record<string, string | null>[])
    .filter((r) => photographerKey(r[nameCol]) === key)
    .map((r) => r.id as string);
  if (ids.length === 0) return { removed: 0 };
  await supabase.from("references").update({ deleted_at: new Date().toISOString() }).in("id", ids);
  revalidatePath(c.href);
  revalidatePath("/trash");
  return { removed: ids.length };
}
