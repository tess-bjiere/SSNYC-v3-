"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import { buildBrief, type VariationRequest, type VariationStyle } from "@/lib/variations";
import { generateVariation, isImageGenConfigured } from "@/lib/imagegen";

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

export async function imageModelConnected(): Promise<boolean> {
  await requireUser();
  return isImageGenConfigured();
}
