"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import { buildBrief, type VariationRequest, type VariationStyle } from "@/lib/variations";
import { generateVariation, isImageGenConfigured } from "@/lib/imagegen";
import { duplicateDraft, type DuplicateSeed } from "@/lib/clone";

// AI variations, the two things that leave the browser (P5).
//
// Building a brief is pure and happens on the client — there is nothing to ask
// a server for. These are the two moments that need one: generating an image
// (when a model is connected) and writing a variation into the style's history.
//
// A variation is recorded as a **version** with `is_ai_generated = true`. That
// column has been on `style_versions` since the first schema and this is what
// it was for, so the whole feature needed no migration: a variation is a change
// to the style, and it belongs in the same history as every other change,
// flagged so nobody mistakes a render for a photograph of a real sample.

export type VariationActionResult = {
  ok: boolean;
  url?: string | null;
  message: string;
};

/** The columns a brief is built from. Narrow on purpose — this never writes to styles. */
async function loadStyle(styleId: string): Promise<VariationStyle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("styles")
    .select("name,style_no,category,garment,designer,brand,season,notes,fit_notes,cover_image")
    .eq("id", styleId)
    .maybeSingle();
  return (data as VariationStyle) ?? null;
}

export async function generateVariationImage(
  styleId: string,
  req: VariationRequest
): Promise<VariationActionResult> {
  await requireUser();
  const style = await loadStyle(styleId);
  if (!style) return { ok: false, message: "That style no longer exists." };

  // The brief is rebuilt here from the stored record rather than trusted from
  // the client: the prompt is the part that has to be right, and it should say
  // what the style actually says.
  const brief = buildBrief(style, req);
  const res = await generateVariation(brief);
  return { ok: Boolean(res.url), url: res.url, message: res.message };
}

/**
 * Write a variation into the style's history.
 *
 * The image is optional and often pasted back by hand — with no model
 * connected, the brief goes out to whatever tool the studio uses and the result
 * comes back as a URL. A version with no image is still worth having: it
 * records that the variation was asked for and what was asked.
 */
export async function recordVariation(
  styleId: string,
  req: VariationRequest,
  imageUrl: string | null
): Promise<VariationActionResult> {
  const supabase = await createClient();
  const user = await requireUser();

  const style = await loadStyle(styleId);
  if (!style) return { ok: false, message: "That style no longer exists." };

  const brief = buildBrief(style, req);
  if (!brief.ready) return { ok: false, message: "Choose what you're changing and say what to." };

  const { count } = await supabase
    .from("style_versions")
    .select("*", { count: "exact", head: true })
    .eq("style_id", styleId);

  const { error } = await supabase.from("style_versions").insert({
    style_id: styleId,
    version_no: (count ?? 0) + 1,
    changes: brief.versionNote,
    season: style.season ?? null,
    image: (imageUrl ?? "").trim() || null,
    is_ai_generated: true,
    // The brief itself is kept, not just its outcome: six months on, "why does
    // this render have the wrong hem" is only answerable if what was asked for
    // is still readable.
    notes: brief.prompt,
    created_by: user?.email ?? null,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/styles/${styleId}`);
  return { ok: true, message: "Saved to this style's versions." };
}

/**
 * Keep a variation as a NEW STYLE rather than as a version of this one.
 *
 * Tess, 2026-08-05: "create a new style or add alternate options to the
 * existing style profile". Two outcomes, and which one is right is a judgement
 * only the designer can make — a colourway is an option on this style, a
 * re-length is often a different garment with its own rounds and its own
 * number. Guessing would be worse than asking, so the box asks.
 *
 * The new style is built by the same duplicateDraft the "Duplicate + edit"
 * button uses (lib/clone.ts, tested), with two differences that are the whole
 * point of coming through this door: the variation goes on as the cover image,
 * and the name says what was changed rather than naming a factory.
 *
 * The generated picture becomes the new style's cover and its first version.
 * It does NOT go into a photography slot: those are photographs of a real
 * sample, and a render is not one.
 */
export async function recordVariationAsStyle(
  styleId: string,
  req: VariationRequest,
  imageUrl: string | null
): Promise<VariationActionResult & { id?: string }> {
  const supabase = await createClient();
  const user = await requireUser();

  const { data: src } = await supabase.from("styles").select("*").eq("id", styleId).maybeSingle();
  if (!src) return { ok: false, message: "That style no longer exists." };

  const brief = buildBrief(src as VariationStyle, req);
  if (!brief.ready) return { ok: false, message: "Choose what you're changing and say what to." };

  const image = (imageUrl ?? "").trim() || null;
  const base = duplicateDraft(src as DuplicateSeed, {
    // "Cropped Rib Tank — Colour: bone" is already the title of the brief, and
    // it is exactly what this new style is.
    name: brief.title,
  });

  const { data: made, error } = await supabase
    .from("styles")
    .insert({
      ...base,
      // A variation is not the same garment on a purchase order, so it does not
      // inherit the number — unlike a factory duplicate, which must.
      style_no: null,
      // It has not been made yet, whatever the original's status is.
      status: "development",
      cover_image: image ?? base.cover_image,
      created_by: user?.email ?? null,
    })
    .select("id")
    .single();

  if (error || !made) return { ok: false, message: error?.message ?? "Could not create the style." };

  await supabase.from("style_versions").insert({
    style_id: made.id,
    version_no: 1,
    changes: brief.versionNote,
    season: (src as { season?: string | null }).season ?? null,
    image,
    is_ai_generated: true,
    notes: brief.prompt,
    created_by: user?.email ?? null,
  });

  revalidatePath("/development");
  revalidatePath(`/styles/${styleId}`);
  return { ok: true, id: made.id as string, message: "Made a new style from this variation." };
}

export async function imageModelConnected(): Promise<boolean> {
  await requireUser();
  return isImageGenConfigured();
}
