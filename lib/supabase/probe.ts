import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

/**
 * Ask the database, from the outside, whether it is still open.
 *
 * The exposure this is checking for is specific: every table is granted to the
 * `public` role, and `public` includes `anon` — the key that ships in the
 * JavaScript bundle of every page. So the honest test is not to read a setting,
 * it is to behave like a stranger holding that key and see what comes back.
 *
 * The awkward part is that Postgres row-level security does not refuse you. It
 * filters. A blocked read returns 200 and an empty list, which looks exactly
 * like an empty table — so "I got nothing back" cannot be read as "I was denied"
 * on its own. Hence two reads: one as the stranger, one as this request. If the
 * table has rows and the stranger cannot see them, the policies are doing their
 * job. If the table has no rows to begin with, this returns null rather than
 * guessing, because a checklist that says "secure" on no evidence is worse than
 * one that admits it does not know.
 *
 * Read-only, one count, no data comes back.
 */
export async function anonCanReadPrivateTable(): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    // What this request can see. Only used to establish that there is
    // something to see — the count, never the rows.
    const mine = await createCookieClient()
      .then((c) => c.from("references").select("*", { count: "exact", head: true }));
    if (mine.error || !mine.count) return null;

    // What a stranger with nothing but the public key can see.
    const stranger = createSupabaseClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const theirs = await stranger.from("references").select("*", { count: "exact", head: true });

    // An outright error means denied, which is the good outcome here.
    if (theirs.error) return false;
    return (theirs.count ?? 0) > 0;
  } catch {
    // Could not reach the database at all. Not evidence of anything.
    return null;
  }
}
