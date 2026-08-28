import { createClient } from "@/lib/supabase/server";
import {
  buildActivity,
  unreadCount,
  watchedStyleIds,
  type ActivityComment,
  type ActivityItem,
} from "@/lib/activity";

// The database side of the in-app activity feed (Tess, 2026-08-26). The pure feed
// logic lives in lib/activity; this reads the rows it needs. Every read is guarded
// so a missing table or a hiccup never breaks the page or, worse, the nav on every
// page — it just yields an empty feed / a zero badge.

export const SEEN_KEY = "activity_seen";

function normEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

/** When this person last opened the feed (ISO), or null if never. */
export async function readActivitySeen(email: string | null): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("settings").select("value").eq("key", SEEN_KEY).maybeSingle();
    const map = (data?.value ?? {}) as Record<string, unknown>;
    const v = map[normEmail(email)];
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** The style ids this person watches (created or commented on), within the brand. */
async function watchedIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brand: string,
  me: string | null
): Promise<{ watched: Set<string>; names: Map<string, string> }> {
  const [createdRes, commentedRes] = await Promise.all([
    supabase
      .from("styles")
      .select("id,name")
      .eq("brand", brand)
      .eq("created_by", me)
      .is("deleted_at", null),
    supabase.from("style_comments").select("style_id").eq("author", me),
  ]);
  const created = (createdRes.data ?? []) as { id: string; name: string | null }[];
  const commented = ((commentedRes.data ?? []) as { style_id: string }[]).map((r) => r.style_id);
  const watched = watchedStyleIds({
    me,
    createdStyleIds: created.map((s) => s.id),
    commentedStyleIds: commented,
  });
  const names = new Map(created.map((s) => [s.id, s.name || "a style"]));
  return { watched, names };
}

/** The nav badge number. Lean and fully guarded — any failure yields 0. */
export async function activityUnreadCount(email: string | null, brand: string): Promise<number> {
  const me = normEmail(email);
  if (!me) return 0;
  try {
    const supabase = await createClient();
    const [lastSeen, { watched }] = await Promise.all([
      readActivitySeen(me),
      watchedIds(supabase, brand, me),
    ]);
    if (watched.size === 0) return 0;
    // Recent comments on the watched styles by other people; the pure counter
    // applies the lastSeen cut. Capped so the badge query stays cheap.
    const { data } = await supabase
      .from("style_comments")
      .select("id,style_id,author,created_at")
      .in("style_id", [...watched])
      .neq("author", me)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    const comments = ((data ?? []) as { id: string; style_id: string; author: string | null; created_at: string }[]).map(
      (r): ActivityComment => ({ id: r.id, styleId: r.style_id, author: r.author, body: "", createdAt: r.created_at })
    );
    return unreadCount({ me, comments, watched, lastSeen });
  } catch {
    return 0;
  }
}

/** The full feed for the /activity page. */
export async function loadActivityFeed(
  email: string | null,
  brand: string
): Promise<{ items: ActivityItem[]; unread: number }> {
  const me = normEmail(email);
  if (!me) return { items: [], unread: 0 };
  try {
    const supabase = await createClient();
    const [lastSeen, { watched, names }] = await Promise.all([
      readActivitySeen(me),
      watchedIds(supabase, brand, me),
    ]);
    if (watched.size === 0) return { items: [], unread: 0 };
    const { data } = await supabase
      .from("style_comments")
      .select("id,style_id,author,body,created_at")
      .in("style_id", [...watched])
      .neq("author", me)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    const comments = ((data ?? []) as {
      id: string;
      style_id: string;
      author: string | null;
      body: string;
      created_at: string;
    }[]).map(
      (r): ActivityComment => ({
        id: r.id,
        styleId: r.style_id,
        author: r.author,
        body: r.body ?? "",
        createdAt: r.created_at,
      })
    );
    return buildActivity({ me, comments, styleNames: names, lastSeen });
  } catch {
    return { items: [], unread: 0 };
  }
}
