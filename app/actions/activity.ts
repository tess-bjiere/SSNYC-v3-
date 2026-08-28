"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import { SEEN_KEY } from "@/app/(app)/activity/data";

// Marking the activity feed seen (Tess, 2026-08-26). Opening /activity stamps
// "now" against the viewer's email in the shared settings row, which clears the
// nav badge. Read-merge-write like the notification prefs, so one person's stamp
// never wipes another's.
export async function markActivitySeen() {
  const user = await requireUser();
  const email = (user?.email ?? "").trim().toLowerCase();
  if (!email) return;
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", SEEN_KEY).maybeSingle();
  const map = { ...((data?.value ?? {}) as Record<string, unknown>) };
  map[email] = new Date().toISOString();
  await supabase
    .from("settings")
    .upsert({ key: SEEN_KEY, value: map, updated_at: new Date().toISOString() }, { onConflict: "key" });
  // The badge is rendered in the layout, which every page shares.
  revalidatePath("/", "layout");
}
