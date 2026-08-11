"use server";

// The reference ⇄ style link — the bridge between the library and the
// development tool.
//
// Everything here writes to `style_references` (style_id, reference_id), which
// is a pure join: linking, unlinking or developing from a reference never
// touches the reference row, its images or its moodboard placements. The two
// foreign keys are ON DELETE CASCADE, so a purged reference or a deleted style
// takes only its own join rows with it and leaves the other side intact.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { styleDraftFromReference } from "@/lib/styleFromRef";
import type { StyleStatus } from "@/lib/types";

// The little bit of a style the reference card needs to show a link.
export type LinkedStyle = {
  id: string;
  name: string;
  status: StyleStatus;
  style_no: string | null;
};

// Every style being developed from this reference. Read by the detail card when
// it opens, so "in development" is visible without a click.
export async function stylesForReference(referenceId: string): Promise<LinkedStyle[]> {
  await requireTeam();
  if (!referenceId) return [];
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("style_references")
    .select("style_id")
    .eq("reference_id", referenceId);

  const ids = (links ?? []).map((l) => l.style_id as string).filter(Boolean);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("styles")
    .select("id,name,status,style_no")
    .in("id", ids)
    // The join row survives a trip to the Trash — nothing is deleted — so the
    // filter belongs here rather than on the link.
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  return (data ?? []) as LinkedStyle[];
}

// Styles the card's "link to an existing style" picker offers. Deliberately a
// short list: the newest handful, narrowed by whatever has been typed.
export async function searchStyles(q: string): Promise<LinkedStyle[]> {
  await requireTeam();
  const supabase = await createClient();
  let query = supabase.from("styles").select("id,name,status,style_no").is("deleted_at", null);
  const term = (q ?? "").trim();
  if (term) {
    // Escape the PostgREST pattern separators so a comma or a paren in the
    // search box can't break out of the filter expression.
    const safe = term.replace(/[,()*]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,style_no.ilike.%${safe}%`);
  }
  const { data } = await query.order("updated_at", { ascending: false }).limit(12);
  return (data ?? []) as LinkedStyle[];
}

// The other direction: references a style profile can be linked to.
//
// Until now linking only ever happened from the reference side — you opened
// something in the Library or on a board and chose "Develop this". The join
// table has always been many-to-many (its primary key is the pair), so a style
// could always carry several references; there was simply no way to say so from
// the style. Tess, 2026-08-04: "you should be able to link multiple products in
// library to single style in development." It could. It just had no button.
export type LinkableReference = {
  id: string;
  designer: string | null;
  year: string | null;
  season: string | null;
  garment: string | null;
  image_url: string | null;
  image: string | null;
  thumb_url: string | null;
  thumb: string | null;
};

const REF_COLS = "id,designer,year,season,garment,image_url,image,thumb_url,thumb";

/**
 * References the "Link a reference" picker offers.
 *
 * Trashed references are excluded — you should not be able to start a new
 * dependency on something already on its way out. A reference trashed *after*
 * it was linked keeps its place on the profile, marked "In Trash", because
 * removing it would erase where the style came from. Provenance survives the
 * bin; new links do not start in it.
 *
 * `exclude` is the set already on this style, filtered here rather than in the
 * UI so the picker never offers a no-op.
 */
export async function searchReferences(
  q: string,
  exclude: readonly string[] = []
): Promise<LinkableReference[]> {
  await requireTeam();
  const supabase = await createClient();

  let query = supabase.from("references").select(REF_COLS).is("deleted_at", null);

  const term = (q ?? "").trim();
  if (term) {
    // Same escaping as searchStyles: strip the characters PostgREST uses to
    // separate filter terms so a comma or a paren cannot break out of the `or`.
    const safe = term.replace(/[,()*]/g, " ").trim();
    if (safe) {
      query = query.or(
        `designer.ilike.%${safe}%,garment.ilike.%${safe}%,season.ilike.%${safe}%,year.ilike.%${safe}%`
      );
    }
  }

  // Over-fetch a little so the exclusions below cannot empty the list.
  const { data } = await query.order("created_at", { ascending: false }).limit(24);

  const skip = new Set(exclude);
  return ((data ?? []) as LinkableReference[]).filter((r) => !skip.has(r.id)).slice(0, 12);
}

export type LinkResult = { ok: boolean; error?: string; styles?: LinkedStyle[] };

export async function linkReference(styleId: string, referenceId: string): Promise<LinkResult> {
  await requireTeam();
  if (!styleId || !referenceId) return { ok: false, error: "Nothing to link." };
  const supabase = await createClient();

  // Composite primary key, so linking twice is a no-op rather than an error —
  // which matters because the same reference can legitimately be opened from
  // the library, a board and the profile itself.
  const { error } = await supabase
    .from("style_references")
    .upsert({ style_id: styleId, reference_id: referenceId }, { ignoreDuplicates: true });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/development");
  return { ok: true, styles: await stylesForReference(referenceId) };
}

export async function unlinkReference(styleId: string, referenceId: string): Promise<LinkResult> {
  await requireTeam();
  if (!styleId || !referenceId) return { ok: false, error: "Nothing to unlink." };
  const supabase = await createClient();

  // Only the join row goes. The reference stays in the library exactly as it
  // was, and the style keeps everything else about it.
  const { error } = await supabase
    .from("style_references")
    .delete()
    .eq("style_id", styleId)
    .eq("reference_id", referenceId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/development");
  return { ok: true, styles: await stylesForReference(referenceId) };
}

// The form-action shape of the same thing, for the "Developed from" block on a
// server-rendered style profile.
export async function unlinkReferenceForm(styleId: string, referenceId: string) {
  await requireTeam();
  await unlinkReference(styleId, referenceId);
}

export type DevelopResult = { ok: boolean; error?: string; id?: string };

// "Develop this" — create a style profile from a reference and link the two.
//
// The style inherits only what describes the garment (see lib/styleFromRef.ts);
// the reference is read and never written. If the style is created but the link
// fails, the style is still returned — a profile with a missing backlink is
// recoverable from the card, a silently swallowed error is not.
export async function developFromReference(referenceId: string): Promise<DevelopResult> {
  if (!referenceId) return { ok: false, error: "No reference given." };
  const supabase = await createClient();
  const user = await requireTeam();

  const { data: ref, error: readErr } = await supabase
    .from("references")
    .select("designer,year,season,category,garment,color,image_url,image,thumb_url,thumb,deleted_at")
    .eq("id", referenceId)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  if (!ref) return { ok: false, error: "That reference no longer exists." };
  if (ref.deleted_at) return { ok: false, error: "That reference is in the Trash." };

  const draft = styleDraftFromReference(ref);

  const { data: created, error: insErr } = await supabase
    .from("styles")
    .insert({ ...draft, created_by: user?.email ?? null })
    .select("id")
    .single();

  if (insErr || !created) return { ok: false, error: insErr?.message || "Could not create the style." };

  const { error: linkErr } = await supabase
    .from("style_references")
    .upsert({ style_id: created.id, reference_id: referenceId }, { ignoreDuplicates: true });

  revalidatePath("/development");
  revalidatePath(`/styles/${created.id}`);

  if (linkErr) {
    return { ok: false, id: created.id, error: `Style created, but the link failed: ${linkErr.message}` };
  }
  return { ok: true, id: created.id };
}
