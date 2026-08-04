"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import { STYLE_STATUSES, type StyleStatus } from "@/lib/types";
import { isPhotoSlot, normalizePhotos, withPhoto } from "@/lib/photoSlots";
import { repurposeDraft, repurposeNote, type StyleSeed } from "@/lib/clone";
import { REFERENCES_BUCKET } from "@/lib/storage";
import { notify } from "@/app/actions/notify";

function s(form: FormData, key: string): string | null {
  const v = form.get(key);
  const str = typeof v === "string" ? v.trim() : "";
  return str.length ? str : null;
}

export async function createStyle(form: FormData) {
  const supabase = await createClient();
  const user = await requireUser();

  const name = s(form, "name");
  if (!name) return;

  const statusRaw = s(form, "status") ?? "inspo";
  const status: StyleStatus = STYLE_STATUSES.includes(statusRaw as StyleStatus)
    ? (statusRaw as StyleStatus)
    : "inspo";

  const { data, error } = await supabase
    .from("styles")
    .insert({
      name,
      style_no: s(form, "style_no"),
      category: s(form, "category"),
      garment: s(form, "garment"),
      designer: s(form, "designer"),
      brand: s(form, "brand"),
      season: s(form, "season"),
      factory: s(form, "factory"),
      cover_image: s(form, "cover_image"),
      tech_pack_url: s(form, "tech_pack_url"),
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
  await requireUser();
  const supabase = await createClient();

  const statusRaw = s(form, "status") ?? "inspo";
  const status: StyleStatus = STYLE_STATUSES.includes(statusRaw as StyleStatus)
    ? (statusRaw as StyleStatus)
    : "inspo";

  await supabase
    .from("styles")
    .update({
      name: s(form, "name") ?? "Untitled",
      style_no: s(form, "style_no"),
      category: s(form, "category"),
      garment: s(form, "garment"),
      designer: s(form, "designer"),
      brand: s(form, "brand"),
      season: s(form, "season"),
      factory: s(form, "factory"),
      cover_image: s(form, "cover_image"),
      tech_pack_url: s(form, "tech_pack_url"),
      notes: s(form, "notes"),
      fit_notes: s(form, "fit_notes"),
      evergreen: form.get("evergreen") === "on",
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath(`/styles/${id}`);
  revalidatePath("/development");
}

export async function setStatus(id: string, status: StyleStatus) {
  const supabase = await createClient();
  const user = await requireUser();

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
  const user = await requireUser();

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

  revalidatePath("/development");
  revalidatePath(`/styles/${styleId}`);
  redirect(`/styles/${made.id}`);
}

export async function addVersion(styleId: string, form: FormData) {
  const supabase = await createClient();
  const user = await requireUser();

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
  const user = await requireUser();
  const body = s(form, "body");
  if (!body) return;

  // Watchers are gathered *before* the insert, so the person commenting does
  // not become their own watcher and the notify step doesn't have to unpick it.
  const { data: style } = await supabase.from("styles").select("name").eq("id", styleId).maybeSingle();

  await supabase.from("style_comments").insert({
    style_id: styleId,
    body,
    status: "open",
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

// Toggle a comment to "Received" (preserves history, per the team decision).
export async function markCommentReceived(styleId: string, commentId: string) {
  const supabase = await createClient();
  const user = await requireUser();

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
    status: s(form, "status"),
    comments: s(form, "comments"),
    fit_notes: s(form, "fit_notes"),
    material_supplier: s(form, "material_supplier"),
    material_ordered_date: s(form, "material_ordered_date"),
    material_eta_date: s(form, "material_eta_date"),
    material_received_date: s(form, "material_received_date"),
  };
}

export async function addSample(styleId: string, form: FormData) {
  await requireUser();
  const supabase = await createClient();
  const round = s(form, "round");
  if (!round) return;

  await supabase.from("style_samples").insert({
    style_id: styleId,
    round,
    ...sampleFields(form),
  });

  revalidatePath(`/styles/${styleId}`);
  revalidatePath("/factories");
}

// A round is logged when it is submitted and finished weeks later, so editing an
// existing round is the normal case, not the exception. The round name itself is
// only overwritten when the form actually sends one, so a partial post can never
// blank it — `round` is NOT NULL.
export async function updateSample(styleId: string, sampleId: string, form: FormData) {
  await requireUser();
  const supabase = await createClient();
  const round = s(form, "round");

  await supabase
    .from("style_samples")
    .update({ ...(round ? { round } : {}), ...sampleFields(form) })
    .eq("id", sampleId)
    .eq("style_id", styleId);

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
//   * the map is always read through normalizePhotos and written whole, so a
//     write to one slot never disturbs another.
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

export async function setStylePhoto(
  styleId: string,
  slotId: string,
  form: FormData
): Promise<PhotoResult> {
  await requireUser();
  if (!isPhotoSlot(slotId)) return { ok: false, error: "Unknown photo slot." };

  const supabase = await createClient();

  // A slot can be filled either by uploading a file or by pasting a URL — the
  // shoot happens on a phone as often as on a laptop.
  let url = s(form, "url");
  const file = form.get("file");

  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { ok: false, error: "That file is not an image." };
    const path = `${PHOTO_PREFIX}/${styleId}/${slotId}-${crypto.randomUUID()}.${photoExt(file.type)}`;
    const { error: upErr } = await supabase.storage
      .from(REFERENCES_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (upErr) return { ok: false, error: upErr.message };
    const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
    url = pub?.publicUrl ?? null;
  }

  if (!url) return { ok: false, error: "Choose a file or paste an image URL." };

  const { data: row } = await supabase.from("styles").select("photos").eq("id", styleId).maybeSingle();
  if (!row) return { ok: false, error: "That style no longer exists." };

  const next = withPhoto(normalizePhotos(row.photos), slotId, url);
  const { error } = await supabase
    .from("styles")
    .update({ photos: next, updated_at: new Date().toISOString() })
    .eq("id", styleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/styles/${styleId}`);
  return { ok: true };
}

// Clears the slot in the map. The uploaded file is deliberately left in Storage:
// re-shooting is common, un-deleting is not, and an orphaned object costs a few
// kilobytes where a wrongly deleted shoot costs a day.
export async function clearStylePhoto(styleId: string, slotId: string) {
  await requireUser();
  if (!isPhotoSlot(slotId)) return;
  const supabase = await createClient();
  const { data: row } = await supabase.from("styles").select("photos").eq("id", styleId).maybeSingle();
  if (!row) return;
  await supabase
    .from("styles")
    .update({ photos: withPhoto(normalizePhotos(row.photos), slotId, null), updated_at: new Date().toISOString() })
    .eq("id", styleId);
  revalidatePath(`/styles/${styleId}`);
}
