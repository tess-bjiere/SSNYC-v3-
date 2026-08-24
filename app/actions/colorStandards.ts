"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFredTeam } from "@/lib/access";
import { activeBrand } from "@/lib/activeBrand";
import { REFERENCES_BUCKET } from "@/lib/storage";
import {
  normalizeStandard,
  setApproval,
  removeApproval,
  type Approval,
  type ColorStandard,
} from "@/lib/colorStandards";

// Every write to a colour standard goes through here, matching
// app/actions/materialOrders.ts: gate, read the row's jsonb, apply a pure
// lib/colorStandards.ts helper, write the whole list back. Nothing
// hard-deletes. The gate is requireFredTeam because standards are FRED-only and
// a server action stays callable on SSYNC even with no page there importing it.

const TABLE = "color_standards";

// The columns a form is allowed to set. Anything else in a patch is ignored, so
// a stray field cannot write to a column it has no business touching.
const FIELDS = [
  "name", "label", "kind", "pantone", "hex", "swatch_url",
  "master_location", "approved_on", "approved_by", "spec", "notes",
] as const;

function pick(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (patch[f] === undefined) continue;
    const v = String(patch[f] ?? "").trim();
    out[f] = v === "" ? null : v;
  }
  // brightener is tri-state: "yes" | "no" | anything else means not-yet-known.
  if (patch.brightener !== undefined) {
    const b = String(patch.brightener ?? "");
    out.brightener = b === "yes" ? true : b === "no" ? false : null;
  }
  return out;
}

async function readStandard(id: string): Promise<ColorStandard | null> {
  const supabase = await createClient();
  const { data } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  return normalizeStandard(data);
}

async function writeApprovals(id: string, approvals: Approval[]) {
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ approvals, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
  revalidatePath(`/color-standards/${id}`);
  revalidatePath("/materials");
}

export async function createStandard(form: FormData) {
  const user = await requireFredTeam();
  const name = ((form.get("name") as string) || "").trim();
  if (!name) return;
  const patch: Record<string, unknown> = { name };
  for (const f of FIELDS) {
    const v = form.get(f);
    if (v !== null) patch[f] = v;
  }
  const b = form.get("brightener");
  if (b !== null) patch.brightener = b;

  const supabase = await createClient();
  const brand = await activeBrand();
  const { data } = await supabase
    .from(TABLE)
    .insert({ ...pick(patch), name, brand, created_by: user?.email ?? null })
    .select("id")
    .single();
  revalidatePath("/color-standards");
  if (data?.id) redirect(`/color-standards/${data.id}`);
}

export async function updateStandard(id: string, patch: Record<string, unknown>) {
  await requireFredTeam();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ ...pick(patch), updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
  revalidatePath(`/color-standards/${id}`);
  revalidatePath("/materials");
}

// Add or patch one material's approval against this standard. Named saveApproval
// so it does not shadow the pure setApproval it calls.
export async function saveApproval(
  id: string,
  materialId: string,
  patch: Partial<Omit<Approval, "material_id">>,
) {
  await requireFredTeam();
  const s = await readStandard(id);
  if (!s) return;
  await writeApprovals(id, setApproval(s, materialId, patch));
}

export async function dropApproval(id: string, materialId: string) {
  await requireFredTeam();
  const s = await readStandard(id);
  if (!s) return;
  await writeApprovals(id, removeApproval(s, materialId));
}

// The swatch photo of the physical master, and a lab dip against it. Both go to
// the existing `references` storage bucket, as materials' images do — a second
// bucket would need its own policies for no gain.
export async function addStandardImage(
  id: string,
  form: FormData,
  slot: "swatch" | "lab_dip",
  materialId?: string,
) {
  await requireFredTeam();
  const file = form.get("file") as File | null;
  if (!file || !file.size) return;
  const supabase = await createClient();
  const path = `color-standards/${id}/${slot}-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from(REFERENCES_BUCKET).upload(path, file, { upsert: true });
  if (error) return;
  const { data: pub } = supabase.storage.from(REFERENCES_BUCKET).getPublicUrl(path);
  const url = pub?.publicUrl;
  if (!url) return;

  if (slot === "swatch") {
    await supabase
      .from(TABLE)
      .update({ swatch_url: url, updated_at: new Date().toISOString() })
      .eq("id", id);
    revalidatePath("/color-standards");
    revalidatePath(`/color-standards/${id}`);
    revalidatePath("/materials");
    return;
  }
  // A lab dip belongs to one material's approval, not to the standard.
  if (!materialId) return;
  const std = await readStandard(id);
  if (!std) return;
  await writeApprovals(id, setApproval(std, materialId, { lab_dip_url: url }));
}

export async function archiveStandard(id: string, archived: boolean) {
  await requireFredTeam();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
}

export async function softDeleteStandard(id: string) {
  await requireFredTeam();
  const supabase = await createClient();
  await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/color-standards");
  redirect("/color-standards");
}
