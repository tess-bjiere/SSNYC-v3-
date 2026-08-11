"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/access";
import { checkSuperAdmin } from "@/lib/brandsServer";
import { toBrandSlug } from "@/lib/brands";

// God-mode brand management (Tess, 2026-08-11: "ability for admin / god mode to
// add new brand"). Add and rename only — no delete, because a brand with styles
// and references behind it must not vanish, the same rule the rest of the app
// follows. Gated to the named super-admins; being team is not enough. The UI
// only shows this to a super-admin, and these re-check on the server.

async function superAdmin() {
  const user = await getSessionUser();
  return checkSuperAdmin(user?.email) ? user : null;
}

export async function addBrand(form: FormData) {
  const me = await superAdmin();
  if (!me) return;
  const name = ((form.get("name") as string) ?? "").trim();
  if (!name) return;
  const slug = toBrandSlug(name);
  // A name that is all punctuation slugs to nothing — reject rather than store a
  // brand nobody can select.
  if (!slug) return;

  const supabase = await createClient();
  // Do-nothing on a slug clash rather than error: adding a brand that already
  // exists is a no-op, not a failure.
  await supabase
    .from("brands")
    .upsert({ slug, name, created_by: me.email ?? null }, { onConflict: "slug", ignoreDuplicates: true });
  revalidatePath("/setup");
}

export async function renameBrand(slug: string, name: string) {
  const me = await superAdmin();
  if (!me) return;
  const s = (slug ?? "").trim();
  const n = (name ?? "").trim();
  // The slug is the stored key and never changes; only the display name does.
  if (!s || !n) return;

  const supabase = await createClient();
  await supabase.from("brands").update({ name: n }).eq("slug", s);
  revalidatePath("/setup");
}
