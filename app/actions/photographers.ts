"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFredTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import { REFERENCES_BUCKET } from "@/lib/storage";
import {
  PHOTOGRAPHER_META_KEY,
  withPhotographerMeta,
  type PhotographerMeta,
} from "@/lib/photographerMeta";

// Set the team-entered side of a photographer — tier, video/directs, clients
// (Tess, 2026-08-17). Stored in the shared `settings` jsonb under one key, keyed
// by the photographer's normalised name, read-modify-write so one edit never
// disturbs another person's card. No table, no migration.
export async function setPhotographerMeta(nameKey: string, patch: Partial<PhotographerMeta>) {
  await requireFredTeam();
  const key = (nameKey ?? "").trim();
  if (!key) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", PHOTOGRAPHER_META_KEY)
    .maybeSingle();

  const next = withPhotographerMeta(data?.value ?? {}, key, patch);
  await supabase
    .from("settings")
    .upsert({ key: PHOTOGRAPHER_META_KEY, value: next, updated_at: new Date().toISOString() });

  revalidatePath("/photographers");
}

// Remove one image off a photographer's profile (Tess, 2026-08-17: "allow to x
// out image easily"). Soft delete, so it goes to Trash and can be restored — the
// same recoverable path as everywhere else, not a hard delete.
export async function removePhotographerImage(id: string) {
  await requireFredTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("references")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/photographers");
  revalidatePath("/trash");
}

// Save selected photographer images into the Campaign library (Tess, 2026-08-19:
// "from the photographer profile, you can specifically select images you want
// saved into the campaign library"). A roster image and a campaign image are the
// same kind of row told apart by `type`, so this just flips the chosen ones from
// 'roster' to 'editorial' — they enter /editorial and keep showing on the
// photographer's profile (which lists both). Scoped to this brand's own roster
// rows so nothing else can be reclassified. Returns how many moved.
export async function saveImagesToCampaign(ids: string[]): Promise<{ saved: number }> {
  await requireFredTeam();
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return { saved: 0 };
  const supabase = await createClient();
  const brand = await activeBrand();
  const { data } = await supabase
    .from("references")
    .update({ type: "editorial" })
    .eq("brand", brand)
    .eq("type", "roster")
    .in("id", clean)
    .select("id");
  revalidatePath("/photographers");
  revalidatePath("/editorial");
  return { saved: data?.length ?? 0 };
}

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "jpg";
}

// Attach a photographer's own work to their profile (Tess, 2026-08-17: "upload
// 3-5 images per photographer ... work that look most similar to FRED at home").
// I can't source those images from here — Instagram blocks fetching and I have no
// write access to FRED's storage bucket — so this is the durable in-app path
// instead: the team uploads the shots that actually feel FRED-at-home and this
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
  formData: FormData
): Promise<{ ok: boolean; added: number; errors: string[] }> {
  await requireFredTeam();
  const name = (photographer ?? "").trim();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/"));
  if (!name) return { ok: false, added: 0, errors: ["No photographer."] };
  if (files.length === 0) return { ok: false, added: 0, errors: ["No image files provided."] };

  const supabase = await createClient();
  const brand = await activeBrand();
  const loc = (location ?? "").trim();

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
        });
      if (upErr) {
        errors.push(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) {
        rows.push({
          brand,
          type: "roster",
          // designer is NOT NULL and means the label/brand of the shoot, which a
          // portfolio sample doesn't have — empty, same as the roster rows.
          designer: "",
          photographer: name,
          location: loc || null,
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
    if (error) return { ok: false, added: 0, errors: [...errors, error.message] };
    revalidatePath("/photographers");
  }
  return { ok: rows.length > 0, added: rows.length, errors };
}
