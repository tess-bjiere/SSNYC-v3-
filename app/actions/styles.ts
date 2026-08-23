"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { activeBrand } from "@/lib/activeBrand";
import { requireTeam } from "@/lib/access";
import { APP } from "@/lib/appConfig";
import { readMaterialIds, normalizeMaterialIds } from "@/lib/sampleMaterials";
import { suggestFredNumber } from "@/lib/fredStyleNumber";
import {
  canDeleteComment,
  canEditComment,
  canRestoreComment,
  nextCommentBody,
  type EditableCommentLike,
} from "@/lib/commentEdit";
import { STYLE_STATUSES, type StyleStatus } from "@/lib/types";
import { DESIGN_SLOTS, isPhotoSlot, writePhotos } from "@/lib/photoSlots";
import {
  COLORWAYS_KEY,
  GALLERY_KEY,
  SHOTS_KEY,
  withImageAdded,
  withImageCaption,
  withImageMoved,
  withImageRemoved,
} from "@/lib/imageList";
import {
  withImageNoteCaption,
  withImagePin,
  withImagePinRemoved,
  withImagePinReply,
  withImagePinReplyRemoved,
} from "@/lib/imageNotes";
import { isOversize, oversizeError } from "@/lib/uploadLimits";
import {
  duplicateDraft,
  duplicateNote,
  pickPhotoSlots,
  repurposeDraft,
  repurposeNote,
  spawnedDuplicateLine,
  spawnedRepurposeLine,
  type DuplicateSeed,
  type StyleSeed,
} from "@/lib/clone";
import { REFERENCES_BUCKET } from "@/lib/storage";
import { notify } from "@/app/actions/notify";

function s(form: FormData, key: string): string | null {
  const v = form.get(key);
  const str = typeof v === "string" ? v.trim() : "";
  return str.length ? str : null;
}

/**
 * A numeric field, or null.
 *
 * An empty box is null rather than 0. A weight of zero is a claim about the
 * garment and an untouched field is not, and the difference matters the first
 * time somebody costs a shipment off a column of them. Anything that is not a
 * finite number — a stray letter, a pasted unit — is also null, because storing
 * NaN in a numeric column fails the write and would lose the rest of the form.
 */
function n(form: FormData, key: string): number | null {
  const v = form.get(key);
  const str = typeof v === "string" ? v.trim() : "";
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

export async function createStyle(form: FormData) {
  const supabase = await createClient();
  const user = await requireTeam();

  const name = s(form, "name");
  if (!name) return;

  // Development is the floor now that inspo is retired: a style being created
  // here is one somebody has decided to make.
  const statusRaw = s(form, "status") ?? "development";
  const status: StyleStatus = STYLE_STATUSES.includes(statusRaw as StyleStatus)
    ? (statusRaw as StyleStatus)
    : "development";

  // The brand is the tenant key now, not a field somebody types: a style is born
  // into the brand you are looking at (multi-brand phase 1). See lib/brands.ts.
  const brand = await activeBrand();

  // FRED auto-numbers a new style from its category when the number is left blank
  // (Tess, 2026-08-20: "i want fred to auto generate style numbers based on our
  // rules, the user would have the ability to edit if needed"). The form shows the
  // suggestion live; a blank submission means "use the rule", so it is recomputed
  // HERE from the brand's live numbers — the true next in the code even if the form
  // sat open a while. A number the user typed is honoured untouched. Retired styles
  // are included in the scan: FRED numbers are never reused, so a killed style's
  // number must not be handed out again.
  let styleNo = s(form, "style_no");
  if (!styleNo && APP.id === "fred") {
    const { data: nums } = await supabase
      .from("styles")
      .select("style_no")
      .eq("brand", brand)
      .not("style_no", "is", null);
    const existing = (nums ?? []).map((r) => (r as { style_no: string | null }).style_no ?? "");
    // The Type (stored in the `garment` column) refines the code within the family
    // — Tops + Shirting → 21, not the anchor 20.
    styleNo = suggestFredNumber(existing, s(form, "category"), s(form, "garment"));
  }

  const { data, error } = await supabase
    .from("styles")
    .insert({
      name,
      style_no: styleNo,
      category: s(form, "category"),
      garment: s(form, "garment"),
      fabric: s(form, "fabric"),
      material: s(form, "material"),
      blank_style: s(form, "blank_style"),
      hs_code: s(form, "hs_code"),
      country_of_origin: s(form, "country_of_origin"),
      weight_lbs: n(form, "weight_lbs"),
      colors: s(form, "colors"),
      designer: s(form, "designer"),
      brand,
      season: s(form, "season"),
      factory: s(form, "factory"),
      cover_image: s(form, "cover_image"),
      tech_pack_url: s(form, "tech_pack_url"),
      wip_url: s(form, "wip_url"),
      notes: s(form, "notes"),
      evergreen: form.get("evergreen") === "on",
      status,
      created_by: user?.email ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return;

  revalidatePath("/development");
  redirect(`/styles/${data.id}`);
}

export async function updateStyle(id: string, form: FormData) {
  await requireTeam();
  const supabase = await createClient();

  // An edit form that posts a status the list no longer offers — a legacy
  // "inspo" row saved from a stale tab — leaves the stored value ALONE rather
  // than being quietly promoted to Development. Saving a name should not
  // relabel a stage nobody touched.
  const statusRaw = s(form, "status");
  const status: StyleStatus | null = STYLE_STATUSES.includes(statusRaw as StyleStatus)
    ? (statusRaw as StyleStatus)
    : null;

  const patch: Record<string, unknown> = {
    name: s(form, "name") ?? "Untitled",
    style_no: s(form, "style_no"),
    category: s(form, "category"),
    garment: s(form, "garment"),
    fabric: s(form, "fabric"),
    material: s(form, "material"),
    hs_code: s(form, "hs_code"),
    country_of_origin: s(form, "country_of_origin"),
    weight_lbs: n(form, "weight_lbs"),
    colors: s(form, "colors"),
    designer: s(form, "designer"),
    // brand is the tenant key now, not an editable field — the edit form has no
    // brand input, so writing s(form,"brand") would blank it to null on every
    // save and drop the style out of every brand's view. It is set once at
    // creation and left alone (multi-brand phase 1).
    factory: s(form, "factory"),
    tech_pack_url: s(form, "tech_pack_url"),
    notes: s(form, "notes"),
    fit_notes: s(form, "fit_notes"),
    evergreen: form.get("evergreen") === "on",
    ...(status ? { status } : {}),
    updated_at: new Date().toISOString(),
  };

  // Cover image is written only when a form actually carries the field.
  //
  // Tess, 2026-08-05: "remove 'cover image url' from details". The input is
  // gone from the edit form, and s() turns a missing field into null — so
  // without this guard the very first save of any style would have quietly
  // blanked cover_image. That column is the last fallback in lib/styleCover.ts
  // and, for older styles with no drawing and no shoot, the only picture they
  // have. Removing a field from a form has to mean the app stopped reading it,
  // never that it started erasing it.
  //
  // The guard is written this way rather than as a one-off `if` on the form
  // input because the rule is general: an absent field is "leave it alone", not
  // "clear it". Any future form that edits a subset of a style can now do so
  // safely for this column.
  if (form.has("cover_image")) patch.cover_image = s(form, "cover_image");

  // Season, Blank style and WIP are hidden on the FRED style form (Tess,
  // 2026-08-20: "FRED style profiles should remove: blank style / WIP / season …
  // Dont edit these on SOUS SOUS or Renggli"). Same guard as cover_image: an
  // absent field means "leave it alone", never "clear it", so hiding a field on
  // one brand can't blank a value another brand still edits.
  if (form.has("season")) patch.season = s(form, "season");
  if (form.has("blank_style")) patch.blank_style = s(form, "blank_style");
  if (form.has("wip_url")) patch.wip_url = s(form, "wip_url");

  await supabase.from("styles").update(patch).eq("id", id);

  revalidatePath(`/styles/${id}`);
  revalidatePath("/development");
}

export async function setStatus(id: string, status: StyleStatus) {
  const supabase = await createClient();
  const user = await requireTeam();

  // Read before writing: an email that says "moved to Production" answers less
  // than one that says "moved from Development to Production", and after the
  // update the old value is gone.
  const { data: before } = await supabase
    .from("styles")
    .select("name,status")
    .eq("id", id)
    .maybeSingle();

  await supabase
    .from("styles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(`/styles/${id}`);
  revalidatePath("/development");

  // Re-saving the status a style already has is not news.
  if (before && before.status !== status) {
    await notify({
      kind: "status",
      styleId: id,
      styleName: (before.name as string) ?? "a style",
      actor: user?.email ?? null,
      from: (before.status as string) ?? null,
      to: status,
    });
  }
}

/**
 * Evergreen on or off, on its own.
 *
 * Evergreen is not a status — a style can be in development and evergreen at
 * the same time — so it gets its own write rather than riding along on the
 * details form, where it was previously the only way to change it. No notify:
 * this is a shelf-life decision, not a stage change, and nobody needs an email
 * about it.
 */
export async function setEvergreen(id: string, on: boolean) {
  await requireTeam();
  const supabase = await createClient();
  await supabase
    .from("styles")
    .update({ evergreen: on, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(`/styles/${id}`);
  revalidatePath("/development");
}

/**
 * Put a style on the Style Library shelf, or take it off.
 *
 * Tess, 2026-08-06: "style library should only have finished styles that have
 * been submitted to style library".
 *
 * The Library was computed before — Production or Archived meant "in it" — and
 * that read the wrong thing off the wrong field. A status says where a style is
 * in the making of it; the Library says somebody looked at the finished thing
 * and decided it was worth reaching for again. Those are different judgements,
 * and a style can be either without being the other, so this is its own write.
 *
 * Taking one off writes null. The row, its rounds, its photographs and its
 * comments are untouched — it stops being read by one page, the same rule the
 * Trash follows. Nothing is deleted, ever.
 *
 * No notify: this is a shelving decision, not a stage change.
 */
export async function setInLibrary(id: string, on: boolean) {
  await requireTeam();
  const supabase = await createClient();
  await supabase
    .from("styles")
    .update({
      library_at: on ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath(`/styles/${id}`);
  revalidatePath("/style-library");
  revalidatePath("/development");
}

// The materials a style is made in — fabrics / trims / packaging linked from the
// library (Tess, 2026-08-19: "add fabric and trims from library to a style in
// development or production"). FRED-only, since the materials library is; on
// SSYNC this is a no-op. The client sends the whole id set after each add or
// remove, so this just normalises and writes it — the style_samples.material_ids
// column takes the same shape for a single round.
export async function setStyleMaterials(styleId: string, ids: string[]) {
  await requireTeam();
  if (APP.id !== "fred" || !styleId) return;
  const supabase = await createClient();
  await supabase
    .from("styles")
    .update({ material_ids: normalizeMaterialIds(ids), updated_at: new Date().toISOString() })
    .eq("id", styleId);
  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/development");
}

// The materials one sample round was sewn in (style_samples.material_ids), set on
// its own so a sample card can sub in an alternate fabric without re-opening the
// whole round form (Tess, 2026-08-20: "have the ability to sub in an alternate
// fabric on one of the samples"). Same shape and FRED gate as setStyleMaterials;
// the caller sends the full desired id set (kept trims/packaging plus the new
// fabric), so this only normalises and writes it.
export async function setSampleMaterials(styleId: string, sampleId: string, ids: string[]) {
  await requireTeam();
  if (APP.id !== "fred" || !sampleId) return;
  const supabase = await createClient();
  await supabase
    .from("style_samples")
    .update({ material_ids: normalizeMaterialIds(ids) })
    .eq("id", sampleId);
  revalidatePath(`/styles/${styleId}`);
}

/**
 * Send a style to the Trash, and bring it back.
 *
 * Tess, 2026-08-05: "you should be able to delete a style and have it sent to
 * the trash."
 *
 * Note what this does NOT do. It does not remove the row. It does not remove
 * the sample rounds, the photographs, the comments, the versions or the
 * library links. It writes one timestamp into styles.deleted_at, and every
 * list in the app stops reading the style. That is the whole mechanism, and it
 * is the same one the Library has used for references since the beginning —
 * one Trash, one idea of what "deleted" means, one place to look when somebody
 * says "where did the Anorak go".
 *
 * There is deliberately no purge for styles. A reference can be destroyed
 * because it is one picture somebody saved; a style is a season of sampling,
 * factory correspondence and photography, and there is no click anybody should
 * be able to make that ends that. If a style genuinely has to go for good it
 * can be done deliberately, in the database, by someone who has said so out
 * loud.
 */
export async function deleteStyle(id: string) {
  await requireTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("styles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/development");
  revalidatePath("/photography");
  revalidatePath("/factories");
  revalidatePath("/trash");
  revalidatePath(`/styles/${id}`);
  redirect("/development");
}

/** Out of the Trash and back onto the boards, exactly as it was. */
export async function restoreStyle(id: string) {
  await requireTeam();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("styles").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/development");
  revalidatePath("/photography");
  revalidatePath("/factories");
  revalidatePath("/trash");
  revalidatePath(`/styles/${id}`);
}

/**
 * Append a version row to a style, numbered after the ones already there.
 *
 * Version numbers are counted rather than stored on the style, which is how
 * addVersion has always done it; this pulls the same three lines out so the two
 * places that spawn a profile do not each reinvent them and drift apart.
 */
async function nextVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  styleId: string,
  row: {
    changes: string;
    season: string | null;
    spawned_style_id?: string | null;
    created_by: string | null;
  }
) {
  const { count } = await supabase
    .from("style_versions")
    .select("*", { count: "exact", head: true })
    .eq("style_id", styleId);

  await supabase.from("style_versions").insert({
    style_id: styleId,
    version_no: (count ?? 0) + 1,
    ...row,
  });
}

// ---------------------------------------------------------------------------
// Repurpose an evergreen style into a new season (P3 #43)
//
// Copy forward, never overwrite. The rules for what carries and what resets live
// in lib/clone.ts; this is only the database work around them:
//
//   1. insert the new style from the draft,
//   2. carry the library references it was developed from — the join rows, not
//      the references themselves, so nothing in the Library is duplicated,
//   3. write the provenance line as the new style's first version, so where it
//      came from is in the version history and not only in the notes.
//
// Sample rounds, photography, comments and the original's versions are
// deliberately not copied: a new season is sampled and shot fresh, and last
// season's dates on a new row would read as real work that never happened.
// ---------------------------------------------------------------------------
export async function repurposeStyle(styleId: string, form: FormData) {
  const supabase = await createClient();
  const user = await requireTeam();

  const { data: src } = await supabase.from("styles").select("*").eq("id", styleId).maybeSingle();
  if (!src) return;

  const season = s(form, "season");
  const draft = repurposeDraft(src as StyleSeed, {
    name: s(form, "name"),
    season,
    style_no: s(form, "style_no"),
  });

  const { data: made, error } = await supabase
    .from("styles")
    .insert({ ...draft, created_by: user?.email ?? null })
    .select("id")
    .single();

  if (error || !made) return;

  // The references behind the original are the references behind the new one.
  const { data: links } = await supabase
    .from("style_references")
    .select("reference_id")
    .eq("style_id", styleId);

  const rows = (links ?? [])
    .map((l) => l.reference_id as string)
    .filter(Boolean)
    .map((reference_id) => ({ style_id: made.id as string, reference_id }));

  if (rows.length) await supabase.from("style_references").insert(rows);

  await supabase.from("style_versions").insert({
    style_id: made.id,
    version_no: 1,
    changes: repurposeNote(src as StyleSeed, season),
    season: draft.season,
    created_by: user?.email ?? null,
  });

  // And the other direction, which is new as of 2026-08-05 (Tess: "versions
  // listed should hyperlink to new proifle"). The style you were standing on
  // gets a version entry of its own recording what it produced, carrying
  // spawned_style_id so the entry is a link to that profile rather than a
  // sentence about it. Without this the parent's Versions list said nothing
  // about the thing the parent had just made.
  await nextVersion(supabase, styleId, {
    changes: spawnedRepurposeLine(draft.name, draft.season),
    season: draft.season,
    spawned_style_id: made.id as string,
    created_by: user?.email ?? null,
  });

  revalidatePath("/development");
  revalidatePath(`/styles/${styleId}`);
  redirect(`/styles/${made.id}`);
}

/**
 * Duplicate a style — the same garment again, usually at a second factory.
 *
 * Tess, 2026-08-05, twice: "if a style is developed by multiple factories, they
 * should have their own profile for each but provide hyperlinks to the other
 * duplicate styles", and "duplicate + edit would just duplicate the style and
 * allow the user to edit the info". Same operation, so one action.
 *
 * What comes across and what does not is decided in lib/clone.ts, which is
 * tested. Two things are decided HERE because they need the database:
 *
 *   The technical drawing carries and nothing else photographic does. photos is
 *   one jsonb object holding four different things (fixed slots, the gallery,
 *   the round shots, the notes written on images), so it is filtered down to
 *   the sketch slots rather than copied. Another factory's protos are its own.
 *
 *   The library references carry, exactly as they do on a repurpose — the
 *   thing it was developed from is still the thing it was developed from.
 *
 * The original is not touched, not marked, and not told. The two profiles find
 * each other by style number (see lib/styleSiblings.ts), which is why
 * duplicateDraft keeps it rather than blanking it.
 */
export async function duplicateStyle(styleId: string, form: FormData) {
  const supabase = await createClient();
  const user = await requireTeam();

  const { data: src } = await supabase.from("styles").select("*").eq("id", styleId).maybeSingle();
  if (!src) return;

  const sketch = pickPhotoSlots((src as { photos?: unknown }).photos, DESIGN_SLOTS.map((sl) => sl.id));

  const draft = duplicateDraft(src as DuplicateSeed, {
    name: s(form, "name"),
    style_no: s(form, "style_no"),
    season: s(form, "season"),
    factory: s(form, "factory"),
    colors: s(form, "colors"),
    photos: sketch,
  });

  const { data: made, error } = await supabase
    .from("styles")
    .insert({ ...draft, created_by: user?.email ?? null })
    .select("id")
    .single();

  if (error || !made) return;

  const { data: links } = await supabase
    .from("style_references")
    .select("reference_id")
    .eq("style_id", styleId);

  const rows = (links ?? [])
    .map((l) => l.reference_id as string)
    .filter(Boolean)
    .map((reference_id) => ({ style_id: made.id as string, reference_id }));

  if (rows.length) await supabase.from("style_references").insert(rows);

  await supabase.from("style_versions").insert({
    style_id: made.id,
    version_no: 1,
    changes: duplicateNote(src as DuplicateSeed, s(form, "factory")),
    season: draft.season,
    created_by: user?.email ?? null,
  });

  // The original now keeps a record of the profile it produced, and that record
  // is the hyperlink. See the note in repurposeStyle — same reasoning, and the
  // reason the "the original is not touched" line above now needs qualifying:
  // no field describing the garment is changed, and the version history gains
  // one entry saying what happened. That is a log, not an edit.
  await nextVersion(supabase, styleId, {
    changes: spawnedDuplicateLine(draft.name, draft.factory),
    season: draft.season,
    spawned_style_id: made.id as string,
    created_by: user?.email ?? null,
  });

  revalidatePath("/development");
  revalidatePath(`/styles/${styleId}`);
  redirect(`/styles/${made.id}`);
}

export async function addVersion(styleId: string, form: FormData) {
  const supabase = await createClient();
  const user = await requireTeam();

  const { count } = await supabase
    .from("style_versions")
    .select("*", { count: "exact", head: true })
    .eq("style_id", styleId);

  await supabase.from("style_versions").insert({
    style_id: styleId,
    version_no: (count ?? 0) + 1,
    changes: s(form, "changes"),
    season: s(form, "season"),
    image: s(form, "image"),
    notes: s(form, "notes"),
    created_by: user?.email ?? null,
  });

  revalidatePath(`/styles/${styleId}`);
}

export async function addComment(styleId: string, form: FormData) {
  const supabase = await createClient();
  const user = await requireTeam();
  const body = s(form, "body");
  if (!body) return;

  // A reply carries the id of the comment it answers. The database will refuse
  // an id that isn't a real comment (the foreign key), and lib/commentTree.ts
  // flattens a reply-to-a-reply onto its thread root on the way out, so nothing
  // here has to police depth.
  const parentId = s(form, "parent_id");

  // What this comment is about: a sample round, or the style as a whole.
  //
  // A reply never sets its own scope — it inherits the scope of the thread it
  // is answering, read back from the parent row rather than trusted from the
  // form. Two reasons, and the second is the real one: a conversation cannot be
  // half about the 1st proto, and a hidden field in a reply form is a thing a
  // page could get wrong while nobody is looking. lib/commentTree.ts enforces
  // the same rule again on the way out, so a row that is somehow wrong still
  // reads in the right place.
  let sampleId = s(form, "sample_id") || null;
  if (parentId) {
    const { data: parent } = await supabase
      .from("style_comments")
      .select("sample_id")
      .eq("id", parentId)
      .maybeSingle();
    sampleId = (parent?.sample_id as string | null) ?? null;
  }

  // Watchers are gathered *before* the insert, so the person commenting does
  // not become their own watcher and the notify step doesn't have to unpick it.
  const { data: style } = await supabase.from("styles").select("name").eq("id", styleId).maybeSingle();

  await supabase.from("style_comments").insert({
    style_id: styleId,
    body,
    status: "open",
    parent_id: parentId,
    sample_id: sampleId,
    author: user?.email ?? null,
  });

  revalidatePath(`/styles/${styleId}`);

  await notify({
    kind: "comment",
    styleId,
    styleName: (style?.name as string) ?? "a style",
    actor: user?.email ?? null,
    body,
  });
}

/**
 * Rewrite a comment you wrote yourself.
 *
 * Tess, 2026-08-05: "make my own comments editable."
 *
 * The authorship check is repeated here rather than trusted from the page.
 * A Server Action is a POST endpoint; the fact that the Edit button was only
 * rendered for your own comments stops nothing on its own. lib/commentEdit.ts
 * holds the rule so it can be tested, and this is the place it is enforced.
 *
 * Two deliberate omissions. There is no edited_at column, because adding one
 * would be a schema change and none goes in unannounced — if the studio later
 * wants "edited 10:42" on the line, that is one nullable column and one line
 * of markup. And there is no notify(): an edit is somebody tidying their own
 * sentence, not a new thing to tell the room about.
 */
export async function editComment(styleId: string, commentId: string, form: FormData) {
  const supabase = await createClient();
  const user = await requireTeam();

  const { data: comment } = await supabase
    .from("style_comments")
    // deleted_at rides along because canEditComment refuses a withdrawn
    // comment — you restore it and then rewrite it, rather than editing
    // something nobody else can currently see.
    .select("author,body,deleted_at")
    .eq("id", commentId)
    .maybeSingle();

  if (!canEditComment(comment as EditableCommentLike | null, user.email)) return;

  // Blank is not a delete. See lib/commentEdit.ts.
  const body = nextCommentBody((comment?.body as string) ?? "", form.get("body") as string | null);
  if (!body) return;

  await supabase.from("style_comments").update({ body }).eq("id", commentId);
  revalidatePath(`/styles/${styleId}`);
}

/**
 * Withdraw a comment — your own, or anybody's if you are one of the two
 * moderators (lib/commentEdit.ts).
 *
 * Tess, 2026-08-06: "allow for comments to be deleted."
 *
 * It writes one timestamp. The row keeps its author, its words, its scope and
 * its place in the thread — the standing rule in this app is that things stop
 * being read, they do not disappear, and a comment thread is the record the
 * studio uses to settle what the factory was told and when. Destroying rows in
 * that record on a single click is not something to offer.
 *
 * So what "deleted" means here, precisely: it stops being shown, and the row
 * stays exactly as it was with its author, its words and its timestamp. Undo
 * lives in the moment after the click. That is the difference between
 * withdrawing a sentence and pretending it was never said, and it is what makes
 * the button safe to press — including safe to hand to a moderator over
 * somebody else's words.
 *
 * The permission check is repeated here rather than trusted from the page, for
 * the same reason editComment repeats it: a Server Action is a POST endpoint,
 * and a button that was never rendered stops nobody.
 *
 * No notify(). Taking your own words back is not an event to wake the room up
 * for, and a "Tess deleted a comment" email would broadcast exactly the thing
 * the person was trying to withdraw.
 *
 * Replies are left alone deliberately. They are somebody else's words, and
 * this rule does not reach them — lib/commentTree.ts already floats a reply
 * whose parent is not in the list up to the top rather than dropping it, so an
 * answer survives the question being withdrawn.
 */
export async function deleteComment(styleId: string, commentId: string) {
  const supabase = await createClient();
  const user = await requireTeam();

  const { data: comment } = await supabase
    .from("style_comments")
    .select("author,deleted_at")
    .eq("id", commentId)
    .maybeSingle();

  if (!canDeleteComment(comment as EditableCommentLike | null, user.email)) return;

  await supabase
    .from("style_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);

  revalidatePath(`/styles/${styleId}`);
}

/** Put a comment you deleted back into the conversation. One timestamp to null. */
export async function restoreComment(styleId: string, commentId: string) {
  const supabase = await createClient();
  const user = await requireTeam();

  const { data: comment } = await supabase
    .from("style_comments")
    .select("author,deleted_at")
    .eq("id", commentId)
    .maybeSingle();

  if (!canRestoreComment(comment as EditableCommentLike | null, user.email)) return;

  await supabase.from("style_comments").update({ deleted_at: null }).eq("id", commentId);
  revalidatePath(`/styles/${styleId}`);
}

// Toggle a comment to "Received" (preserves history, per the team decision).
export async function markCommentReceived(styleId: string, commentId: string) {
  const supabase = await createClient();
  const user = await requireTeam();

  const [{ data: comment }, { data: style }] = await Promise.all([
    supabase.from("style_comments").select("author,body,status").eq("id", commentId).maybeSingle(),
    supabase.from("styles").select("name").eq("id", styleId).maybeSingle(),
  ]);

  await supabase.from("style_comments").update({ status: "received" }).eq("id", commentId);
  revalidatePath(`/styles/${styleId}`);

  // Only the first time. Re-marking a comment that is already received is a
  // click, not an event, and the person who asked has already been told.
  if (comment && comment.status !== "received") {
    await notify({
      kind: "comment_received",
      styleId,
      styleName: (style?.name as string) ?? "a style",
      actor: user?.email ?? null,
      commentAuthor: (comment.author as string) ?? null,
      commentBody: (comment.body as string) ?? "",
    });
  }
}

// The fields a sample round carries beyond its round name. Shared by add and
// update so the two can never drift — a field added to the form once appears in
// both paths.
function sampleFields(form: FormData) {
  return {
    factory: s(form, "factory"),
    submitted_date: s(form, "submitted_date"),
    received_date: s(form, "received_date"),
    // When the sample is expected back. Not material_eta_date — that is the
    // fabric reaching the factory, usually weeks earlier.
    eta_date: s(form, "eta_date"),
    status: s(form, "status"),
    // When the fitting is booked for. Always read, never conditional on the
    // status being "fitting scheduled" — a field that stops posting blanks its
    // column on the next save, so a date set on Monday would vanish the moment
    // somebody moved the status on, which is exactly when you still want to
    // know when it was fitted.
    fitting_date: s(form, "fitting_date"),
    // The day corrections were sent back to the factory (Tess, 2026-08-10). Read
    // the same way as the fitting date, and for the same reason.
    notes_sent_date: s(form, "notes_sent_date"),
    // Where the physical garment is right now (Tess, 2026-08-05: "add 'current
    // sample location' into sample rounds"). Free text on the way in as well as
    // in the column: the form offers the five places the studio actually sends
    // things and a Custom box, and whichever of the two was used posts the same
    // field. Nothing here needs to know which.
    location: s(form, "location"),
    // The courier reference for the leg it is on (Tess, 2026-08-06). Read on
    // both paths, so a number can be added the day after the box goes out.
    tracking_number: s(form, "tracking_number"),
    // How the sample came out — good / workable / poor (Tess, 2026-08-05: "add
    // a rating to each sample round as good - green, workable - yellow, poor -
    // red"). The "Not rated" radio posts an empty string, which s() turns into
    // null, so clearing a rating is the same gesture as giving one.
    rating: s(form, "rating"),
    // Who at the factory this round is with. Read by both add and update so a
    // contact can be filled in later on a round that started without one.
    contact_name: s(form, "contact_name"),
    contact_email: s(form, "contact_email"),
    comments: s(form, "comments"),
    fit_notes: s(form, "fit_notes"),
    // The material, in words. The four material_*_date columns are no longer
    // offered as inputs and are deliberately NOT listed here: leaving them out
    // means a save from the new form cannot blank a date an old round holds.
    material_supplier: s(form, "material_supplier"),
    material_type: s(form, "material_type"),
    material_contents: s(form, "material_contents"),
    material_notes: s(form, "material_notes"),
    // Links into the fabric & trim library, alongside the words above rather
    // than instead of them — a round is often made in something nobody has
    // entered into the library yet.
    //
    // FRED only, and spread so the key is ABSENT rather than null elsewhere:
    // the materials table has never been applied to the Loyalist project
    // (db/p11-materials.sql) and the library is hidden on the SSYNC deploy, so
    // there is nothing there to link to and a write would only find a column
    // that does not exist. Same reasoning as the four material_*_date columns
    // above — a save from a form that does not offer the field must not be
    // able to blank it.
    ...(APP.id === "fred" ? { material_ids: readMaterialIds(form.getAll("material_ids")) } : {}),
  };
}

export async function addSample(styleId: string, form: FormData) {
  await requireTeam();
  const supabase = await createClient();
  const round = s(form, "round");
  if (!round) return;

  // Surface a rejected write instead of swallowing it. This one bit hard (Tess,
  // 2026-08-20: "when i add a sample round its not saving"): style_samples on FRED
  // was missing the material_ids column sampleFields writes, so PostgREST refused
  // every insert and the round vanished with no sign. A save that fails must say
  // so, not look like it worked.
  const { error } = await supabase.from("style_samples").insert({
    style_id: styleId,
    round,
    ...sampleFields(form),
  });
  if (error) throw new Error(`Could not add the round: ${error.message}`);

  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/factories");
}

// A round is logged when it is submitted and finished weeks later, so editing an
// existing round is the normal case, not the exception. The round name itself is
// only overwritten when the form actually sends one, so a partial post can never
// blank it — `round` is NOT NULL.
export async function updateSample(styleId: string, sampleId: string, form: FormData) {
  await requireTeam();
  const supabase = await createClient();
  const round = s(form, "round");

  const { error } = await supabase
    .from("style_samples")
    .update({ ...(round ? { round } : {}), ...sampleFields(form) })
    .eq("id", sampleId)
    .eq("style_id", styleId);
  if (error) throw new Error(`Could not save the round: ${error.message}`);

  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/factories");
}

// ---------------------------------------------------------------------------
// Photography slots (P3 #39)
//
// The slots themselves are defined in lib/photoSlots.ts. Everything here does is
// move one URL in or out of the styles.photos jsonb map. Two rules matter:
//
//   * the slot id is checked against the standard before anything is written, so
//     a stale or hand-made form post can never invent a key; and
//   * the map is written through writePhotos, which carries every key it does
//     not recognise straight through. That is not a nicety — styles.photos also
//     holds the gallery, and a slot write that normalised first would delete it.
//
// Photos live in the same Storage bucket as references, under a `styles/`
// prefix. That prefix keeps them clear of the per-reference uuid folders, so
// purging a reference can never reach a style's photography.
// ---------------------------------------------------------------------------

const PHOTO_PREFIX = "styles";

function photoExt(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/avif") return "avif";
  return "jpg";
}

export type PhotoResult = { ok: boolean; error?: string };

/**
 * Turn "a file or a pasted URL" into one URL.
 *
 * Every image entry point in the development tool takes both, because the shoot
 * happens on a phone as often as on a laptop and half the reference images
 * already live somewhere with a URL. Shared so the size limit, the image-type
 * check and the storage layout are decided in exactly one place.
 *
 * Returns { url } on success or { error } with something a person can act on.
 */
async function resolveImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  form: FormData,
  pathPrefix: string
): Promise<{ url?: string; error?: string }> {
  const pasted = s(form, "url");
  const file = form.get("file");

  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { error: "That file is not an image." };
    if (isOversize(file.size)) return { error: oversizeError(file.name, file.size) };

    const path = `${pathPrefix}-${crypto.randomUUID()}.${photoExt(file.type)}`;
    const { error: upErr } = await supabase.storage
      .from(REFERENCES_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (upErr) return { error: upErr.message };

    const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl ?? "";
    if (!url) return { error: "The image uploaded but has no public URL." };
    return { url };
  }

  if (pasted) return { url: pasted };
  return { error: "Choose a file or paste an image URL." };
}

export async function setStylePhoto(
  styleId: string,
  slotId: string,
  form: FormData
): Promise<PhotoResult> {
  await requireTeam();
  if (!isPhotoSlot(slotId)) return { ok: false, error: "Unknown photo slot." };

  const supabase = await createClient();
  const got = await resolveImage(supabase, form, `${PHOTO_PREFIX}/${styleId}/${slotId}`);
  if (!got.url) return { ok: false, error: got.error };

  const { data: row } = await supabase.from("styles").select("photos").eq("id", styleId).maybeSingle();
  if (!row) return { ok: false, error: "That style no longer exists." };

  const { error } = await supabase
    .from("styles")
    .update({ photos: writePhotos(row.photos, slotId, got.url), updated_at: new Date().toISOString() })
    .eq("id", styleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/styles/${styleId}`);
  return { ok: true };
}

// Clears the slot in the map. The uploaded file is deliberately left in Storage:
// re-shooting is common, un-deleting is not, and an orphaned object costs a few
// kilobytes where a wrongly deleted shoot costs a day.
export async function clearStylePhoto(styleId: string, slotId: string) {
  await requireTeam();
  if (!isPhotoSlot(slotId)) return;
  const supabase = await createClient();
  const { data: row } = await supabase.from("styles").select("photos").eq("id", styleId).maybeSingle();
  if (!row) return;
  await supabase
    .from("styles")
    .update({ photos: writePhotos(row.photos, slotId, null), updated_at: new Date().toISOString() })
    .eq("id", styleId);
  revalidatePath(`/styles/${styleId}`);
}

// ---------------------------------------------------------------------------
// The style gallery (P3 refinements — "allow for multiple images")
//
// The five photography slots answer "has this been shot to standard?". They are
// not where you put the eleven pictures somebody took on a factory visit. Those
// go in an ordered list under styles.photos.gallery — same jsonb, no migration,
// and written through lib/imageList.ts so the slots beside it are untouched.
// ---------------------------------------------------------------------------

async function writeStylePhotos(styleId: string, next: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("styles")
    .update({ photos: next, updated_at: new Date().toISOString() })
    .eq("id", styleId);
  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/development");
  return error?.message;
}

async function readStylePhotos(styleId: string): Promise<unknown | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("styles").select("photos").eq("id", styleId).maybeSingle();
  return data ? data.photos : null;
}

export async function addStyleImage(styleId: string, form: FormData): Promise<PhotoResult> {
  await requireTeam();
  const supabase = await createClient();

  const got = await resolveImage(supabase, form, `${PHOTO_PREFIX}/${styleId}/gallery`);
  if (!got.url) return { ok: false, error: got.error };

  const { data: row } = await supabase.from("styles").select("photos").eq("id", styleId).maybeSingle();
  if (!row) return { ok: false, error: "That style no longer exists." };

  // The id is minted here rather than in lib/imageList.ts, which stays pure.
  const next = withImageAdded(row.photos, GALLERY_KEY, {
    id: crypto.randomUUID(),
    url: got.url,
    caption: s(form, "caption"),
  });

  const err = await writeStylePhotos(styleId, next);
  return err ? { ok: false, error: err } : { ok: true };
}

// --- Colourways -------------------------------------------------------------
//
// Tess, 2026-08-07: "add a way to add multiple colors to a style profile".
//
// The same four operations as the gallery, against COLORWAYS_KEY. Written out
// rather than generalised into one function taking a key: these are server
// actions, every one of them is an endpoint, and a single endpoint that takes
// the jsonb key to write from the client is a hole — it would accept "gallery",
// and it would just as happily accept the photography slots map.

export async function addStyleColorway(styleId: string, form: FormData): Promise<PhotoResult> {
  await requireTeam();
  const supabase = await createClient();

  const got = await resolveImage(supabase, form, `${PHOTO_PREFIX}/${styleId}/colorways`);
  if (!got.url) return { ok: false, error: got.error };

  const { data: row } = await supabase.from("styles").select("photos").eq("id", styleId).maybeSingle();
  if (!row) return { ok: false, error: "That style no longer exists." };

  const next = withImageAdded(row.photos, COLORWAYS_KEY, {
    id: crypto.randomUUID(),
    url: got.url,
    // The colour name. Blank is allowed — a picture of a colourway nobody has
    // named yet is still worth having on the page.
    caption: s(form, "caption"),
  });

  const err = await writeStylePhotos(styleId, next);
  return err ? { ok: false, error: err } : { ok: true };
}

export async function removeStyleColorway(styleId: string, imageId: string) {
  await requireTeam();
  const photos = await readStylePhotos(styleId);
  if (photos === null) return;
  await writeStylePhotos(styleId, withImageRemoved(photos, COLORWAYS_KEY, imageId));
}

export async function captionStyleColorway(styleId: string, imageId: string, form: FormData) {
  await requireTeam();
  const photos = await readStylePhotos(styleId);
  if (photos === null) return;
  await writeStylePhotos(styleId, withImageCaption(photos, COLORWAYS_KEY, imageId, s(form, "caption") ?? ""));
}

export async function moveStyleColorway(styleId: string, imageId: string, delta: number) {
  await requireTeam();
  const photos = await readStylePhotos(styleId);
  if (photos === null) return;
  await writeStylePhotos(styleId, withImageMoved(photos, COLORWAYS_KEY, imageId, delta));
}

export async function removeStyleImage(styleId: string, imageId: string) {
  await requireTeam();
  const photos = await readStylePhotos(styleId);
  if (photos === null) return;
  await writeStylePhotos(styleId, withImageRemoved(photos, GALLERY_KEY, imageId));
}

export async function captionStyleImage(styleId: string, imageId: string, form: FormData) {
  await requireTeam();
  const photos = await readStylePhotos(styleId);
  if (photos === null) return;
  await writeStylePhotos(styleId, withImageCaption(photos, GALLERY_KEY, imageId, s(form, "caption")));
}

export async function moveStyleImage(styleId: string, imageId: string, delta: number) {
  await requireTeam();
  const photos = await readStylePhotos(styleId);
  if (photos === null) return;
  await writeStylePhotos(styleId, withImageMoved(photos, GALLERY_KEY, imageId, delta));
}

// ---------------------------------------------------------------------------
// Model shots on a sample round (P3 refinements)
//
// "add the ability to add additional model shots" — attached to the round, not
// the style, so the 1st proto's shots sit with the 1st proto and the 2nd
// proto's sit with the 2nd. That is the difference between a folder of photos
// and a record of what changed.
//
// Every write is scoped by BOTH sample id and style id, so a form post cannot
// reach a round belonging to another style.
// ---------------------------------------------------------------------------

async function readSamplePhotos(styleId: string, sampleId: string): Promise<unknown | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("style_samples")
    .select("photos")
    .eq("id", sampleId)
    .eq("style_id", styleId)
    .maybeSingle();
  return data ? data.photos : null;
}

async function writeSamplePhotos(styleId: string, sampleId: string, next: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("style_samples")
    .update({ photos: next })
    .eq("id", sampleId)
    .eq("style_id", styleId);
  revalidatePath(`/styles/${styleId}`);
  return error?.message;
}

/**
 * The photography standard, filled on one round.
 *
 * Tess, 2026-08-05: "photography should not be it's own section, it needs to
 * live within the specific sample round."
 *
 * Same five slots, same jsonb shape, same writePhotos guard — the only thing
 * that changed is which row the map hangs off. That is the point: a lay flat is
 * a photograph of a specific garment that a specific factory made on a specific
 * round, and filing it on the style meant the PPS quietly overwrote the proto
 * and the studio lost the ability to see what changed between them.
 *
 * writePhotos is what makes this safe to share a column with the round's free
 * shots list: it writes through the raw jsonb and leaves every key it did not
 * come for exactly where it is.
 *
 * Scoped by style id as well as sample id, like every other write in this
 * block, so a hand-made post cannot reach a round belonging to another style.
 */
export async function setSamplePhoto(
  styleId: string,
  sampleId: string,
  slotId: string,
  form: FormData
): Promise<PhotoResult> {
  await requireTeam();
  if (!isPhotoSlot(slotId)) return { ok: false, error: "Unknown photo slot." };

  const supabase = await createClient();
  const got = await resolveImage(
    supabase,
    form,
    `${PHOTO_PREFIX}/${styleId}/samples/${sampleId}/${slotId}`
  );
  if (!got.url) return { ok: false, error: got.error };

  const photos = await readSamplePhotos(styleId, sampleId);
  if (photos === null) {
    // maybeSingle() returned nothing: the round is gone, or belongs to another
    // style. Either way there is nothing to write to and saying so beats a
    // silent no-op that looks like a slow network.
    const { data: exists } = await supabase
      .from("style_samples")
      .select("id")
      .eq("id", sampleId)
      .eq("style_id", styleId)
      .maybeSingle();
    if (!exists) return { ok: false, error: "That sample round no longer exists." };
  }

  const err = await writeSamplePhotos(styleId, sampleId, writePhotos(photos, slotId, got.url));
  return err ? { ok: false, error: err } : { ok: true };
}

// Clears the slot on the round. As with the style-level version, the uploaded
// file is left in Storage — re-shooting is common, un-deleting is not.
export async function clearSamplePhoto(styleId: string, sampleId: string, slotId: string) {
  await requireTeam();
  if (!isPhotoSlot(slotId)) return;
  const photos = await readSamplePhotos(styleId, sampleId);
  await writeSamplePhotos(styleId, sampleId, writePhotos(photos, slotId, null));
}

export async function addSampleShot(
  styleId: string,
  sampleId: string,
  form: FormData
): Promise<PhotoResult> {
  await requireTeam();
  const supabase = await createClient();

  const got = await resolveImage(supabase, form, `${PHOTO_PREFIX}/${styleId}/samples/${sampleId}`);
  if (!got.url) return { ok: false, error: got.error };

  const photos = await readSamplePhotos(styleId, sampleId);
  if (photos === null) return { ok: false, error: "That round no longer exists." };

  const next = withImageAdded(photos, SHOTS_KEY, {
    id: crypto.randomUUID(),
    url: got.url,
    caption: s(form, "caption"),
  });

  const err = await writeSamplePhotos(styleId, sampleId, next);
  return err ? { ok: false, error: err } : { ok: true };
}

export async function removeSampleShot(styleId: string, sampleId: string, imageId: string) {
  await requireTeam();
  const photos = await readSamplePhotos(styleId, sampleId);
  if (photos === null) return;
  await writeSamplePhotos(styleId, sampleId, withImageRemoved(photos, SHOTS_KEY, imageId));
}

export async function captionSampleShot(
  styleId: string,
  sampleId: string,
  imageId: string,
  form: FormData
) {
  await requireTeam();
  const photos = await readSamplePhotos(styleId, sampleId);
  if (photos === null) return;
  await writeSamplePhotos(
    styleId,
    sampleId,
    withImageCaption(photos, SHOTS_KEY, imageId, s(form, "caption"))
  );
}

export async function moveSampleShot(
  styleId: string,
  sampleId: string,
  imageId: string,
  delta: number
) {
  await requireTeam();
  const photos = await readSamplePhotos(styleId, sampleId);
  if (photos === null) return;
  await writeSamplePhotos(styleId, sampleId, withImageMoved(photos, SHOTS_KEY, imageId, delta));
}

// ---------------------------------------------------------------------------
// Notes written on a photograph (Tess, 2026-08-05: "you should be able to add
// text comments to each image as well as notate on the images")
//
// A caption says what a picture is; a pin says what is wrong with it, at a
// place. Both live in the same photos jsonb as the image itself — see
// lib/imageNotes.ts for the shape and for why a note is keyed by the image's
// URL rather than by its slot.
//
// Every action here takes a sampleId that may be null, because the same
// photograph can be sitting in a style's slot, a style's gallery, a round's
// slot or a round's shots, and a note on it means the same thing in all four.
// One set of actions rather than four is the same decision SlotCards and
// ImageStrip already make: the alternative is four implementations of one idea,
// three of which are subtly out of date.
//
// Scoped by style id as well as sample id on the round path, like every other
// write in this file, so a hand-made post cannot reach another style's round.
// ---------------------------------------------------------------------------

async function readPhotosFor(styleId: string, sampleId: string | null): Promise<unknown | null> {
  return sampleId ? readSamplePhotos(styleId, sampleId) : readStylePhotos(styleId);
}

async function writePhotosFor(
  styleId: string,
  sampleId: string | null,
  next: Record<string, unknown>
): Promise<string | undefined> {
  return sampleId
    ? writeSamplePhotos(styleId, sampleId, next)
    : writeStylePhotos(styleId, next);
}

/** The line under the picture. A blank caption clears it. */
export async function setImageCaption(
  styleId: string,
  sampleId: string | null,
  url: string,
  form: FormData
): Promise<PhotoResult> {
  await requireTeam();
  const photos = await readPhotosFor(styleId, sampleId);
  if (photos === null) return { ok: false, error: "That no longer exists." };
  const err = await writePhotosFor(
    styleId,
    sampleId,
    withImageNoteCaption(photos, url, s(form, "caption"))
  );
  return err ? { ok: false, error: err } : { ok: true };
}

/**
 * Drop a mark on the picture, or move/retype one already there.
 *
 * One action for both because they are one act to the person doing it. A null
 * pinId means a new mark and the id is minted here — lib/imageNotes.ts stays
 * pure, and a function that invents a uuid is not pure.
 */
export async function saveImagePin(
  styleId: string,
  sampleId: string | null,
  url: string,
  pin: { id: string | null; x: number; y: number; text: string }
): Promise<PhotoResult> {
  await requireTeam();
  const photos = await readPhotosFor(styleId, sampleId);
  if (photos === null) return { ok: false, error: "That no longer exists." };
  const err = await writePhotosFor(
    styleId,
    sampleId,
    withImagePin(photos, url, {
      id: pin.id || crypto.randomUUID(),
      x: pin.x,
      y: pin.y,
      text: pin.text,
    })
  );
  return err ? { ok: false, error: err } : { ok: true };
}

/** Take a mark off the picture. The other marks and the caption stay. */
export async function removeImagePin(
  styleId: string,
  sampleId: string | null,
  url: string,
  pinId: string
): Promise<PhotoResult> {
  await requireTeam();
  const photos = await readPhotosFor(styleId, sampleId);
  if (photos === null) return { ok: false, error: "That no longer exists." };
  const err = await writePhotosFor(styleId, sampleId, withImagePinRemoved(photos, url, pinId));
  return err ? { ok: false, error: err } : { ok: true };
}

/**
 * Answer a fit comment (Tess, 2026-08-17: "Reply to fit comments in thread").
 *
 * The author and time are stamped here from the session, never trusted from the
 * client — the reply reads as a conversation, and who said what has to be true.
 * The id is minted here too, so lib/imageNotes.ts stays pure.
 *
 * Deliberately no notify(): the mark-and-reply system has never emailed the room
 * (saveImagePin doesn't either), and turning every reply into a notification is
 * a decision to make on its own, not a side effect of adding replies.
 */
export async function addImagePinReply(
  styleId: string,
  sampleId: string | null,
  url: string,
  pinId: string,
  body: string
): Promise<PhotoResult> {
  const user = await requireTeam();
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Write something first." };
  const photos = await readPhotosFor(styleId, sampleId);
  if (photos === null) return { ok: false, error: "That no longer exists." };
  const err = await writePhotosFor(
    styleId,
    sampleId,
    withImagePinReply(photos, url, pinId, {
      id: crypto.randomUUID(),
      author: user?.email ?? null,
      text,
      at: new Date().toISOString(),
    })
  );
  return err ? { ok: false, error: err } : { ok: true };
}

/** Drop one reply off a mark's thread. The mark and its other replies stay. */
export async function removeImagePinReply(
  styleId: string,
  sampleId: string | null,
  url: string,
  pinId: string,
  replyId: string
): Promise<PhotoResult> {
  await requireTeam();
  const photos = await readPhotosFor(styleId, sampleId);
  if (photos === null) return { ok: false, error: "That no longer exists." };
  const err = await writePhotosFor(
    styleId,
    sampleId,
    withImagePinReplyRemoved(photos, url, pinId, replyId)
  );
  return err ? { ok: false, error: err } : { ok: true };
}
