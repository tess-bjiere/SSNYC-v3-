"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import {
  buildEmails,
  normalizePrefs,
  setPrefs,
  watchersOf,
  type NotifyChannel,
  type NotifyEvent,
  type NotifyPrefs,
} from "@/lib/notify";
import { appBaseUrl, isMailConfigured, sendEmails } from "@/lib/mailer";

// ---------------------------------------------------------------------------
// Gathering the facts a notification needs (P4)
//
// lib/notify decides who and what; lib/mailer does the sending; this reads the
// database in between. It is the only piece that knows a style has comments.
//
// Nothing here is allowed to break the thing that triggered it. A comment that
// saved is saved whether or not anyone could be told about it, so every entry
// point is wrapped and failures are logged rather than raised — an outage at a
// mail provider must never look to Tess like a comment that didn't post.
// ---------------------------------------------------------------------------

const PREFS_KEY = "notifications";

export async function readPrefs(): Promise<NotifyPrefs> {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", PREFS_KEY).maybeSingle();
  return normalizePrefs(data?.value);
}

/**
 * Save the signed-in person's own switches.
 *
 * Read-merge-write, exactly like the curated lists: the row holds the whole
 * team, and a blind overwrite would re-subscribe whoever opted out last week.
 */
export async function savePrefs(next: Partial<Record<NotifyChannel, boolean>>) {
  const user = await requireUser();
  if (!user?.email) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const current = await readPrefs();
  const merged = setPrefs(current, user.email, next);

  const { error } = await supabase
    .from("settings")
    .upsert({ key: PREFS_KEY, value: merged, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/notifications");
  return { ok: true };
}

/** Everyone with a stake in a style: its author, and everyone who has commented. */
async function watchersForStyle(styleId: string): Promise<string[]> {
  const supabase = await createClient();
  const [{ data: style }, { data: comments }] = await Promise.all([
    supabase.from("styles").select("created_by").eq("id", styleId).maybeSingle(),
    supabase.from("style_comments").select("author").eq("style_id", styleId),
  ]);
  return watchersOf({
    createdBy: (style?.created_by as string) ?? null,
    commentAuthors: (comments ?? []).map((c) => (c.author as string) ?? null),
  });
}

/**
 * The single entry point. Fire-and-report: callers await it so a serverless
 * function isn't killed mid-send, but they ignore the result.
 */
export async function notify(event: NotifyEvent) {
  await requireUser();
  try {
    const [watchers, prefs] = await Promise.all([watchersForStyle(event.styleId), readPrefs()]);
    const emails = buildEmails(event, watchers, prefs, appBaseUrl());
    if (emails.length === 0) return;
    await sendEmails(emails);
  } catch (err) {
    console.warn("[notify] could not send", err);
  }
}

/** Surfaced on the preferences page so the state is honest rather than implied. */
export async function mailConfigured(): Promise<boolean> {
  await requireUser();
  return isMailConfigured();
}
