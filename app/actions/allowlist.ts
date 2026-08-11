"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeam } from "@/lib/access";
import { normalizeEmail } from "@/lib/authz";
import { isBrandSlug } from "@/lib/brands";

// Onboarding people (multi-brand phase 3, Tess 2026-08-11).
//
// The allowlist is the whole access model now: an org address is team by
// domain, and this is where everyone else is added — an outside collaborator as
// team (full access), or a brand's talent (ideation only, one brand). Team only,
// like everything on Setup.
//
// The org's own people are never put here; they are team by domain, and a row
// for them would be noise. The UI keeps them out.

export async function addMember(form: FormData) {
  const me = await requireTeam();
  const email = normalizeEmail(form.get("email") as string | null);
  if (!email || email.lastIndexOf("@") <= 0) return;

  const role = (form.get("role") as string)?.trim() === "talent" ? "talent" : "team";
  const brandRaw = ((form.get("brand") as string) ?? "").trim();
  const brand = role === "talent" ? brandRaw : null;
  // A talent must be pinned to a real brand — otherwise they are allowed in but
  // scoped to nothing, which is a support call, not a feature.
  if (role === "talent" && !isBrandSlug(brand)) return;

  const supabase = await createClient();
  // Delete-then-insert rather than upsert, so re-adding an address to change its
  // role or brand works without depending on a unique constraint being present.
  await supabase.from("app_allowlist").delete().eq("email", email);
  await supabase.from("app_allowlist").insert({
    email,
    role,
    brand,
    added_by: me.email ?? "setup",
  });
  revalidatePath("/setup");
}

export async function removeMember(email: string) {
  await requireTeam();
  const e = normalizeEmail(email);
  if (!e) return;
  const supabase = await createClient();
  await supabase.from("app_allowlist").delete().eq("email", e);
  revalidatePath("/setup");
}
