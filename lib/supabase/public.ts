import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

/**
 * The client behind the two public pages — /r/[id] and /share/[id].
 *
 * Those pages have no signed-in user by design: the whole point of a share
 * link is that you can send it to a factory or a photographer who will never
 * have an account. Today they work because the database grants `SELECT` on
 * `references` and `moodboards` to the anonymous role, which also means the
 * anon key in the browser bundle can read the studio's entire library. That is
 * the exposure the P0 RLS change closes, and closing it takes the public pages
 * with it unless they get their own way in.
 *
 * So they get one. The authority of a share link is *knowing the id* — a v4
 * UUID nobody guesses — and the right place to enforce that is the query, on
 * the server, one row at a time. Not a blanket grant in the database that
 * happens to be reachable from anywhere with the public key.
 *
 * Two rules for anything that uses this client, and they are the only reason
 * it is safe:
 *
 *   1. Every read is scoped to ids that came from the URL, or from a row
 *      already resolved from the URL. Never a list, never a search, never a
 *      `select *` across a table.
 *   2. It is never used to write. Nothing on these pages writes.
 *
 * Until `SUPABASE_SERVICE_ROLE_KEY` is set it falls back to the ordinary
 * cookie client, which is exactly today's behaviour — so this ships without
 * breaking anything, and the RLS tightening is the step that makes it matter.
 * Same shape as the mailer: the module is complete, the credential arrives later.
 */

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when the elevated read path is actually available. */
export const PUBLIC_READ_ELEVATED = Boolean(SERVICE_KEY);

if (!SERVICE_KEY) {
  // Once, at module load — not once per request.
  console.warn(
    "[supabase] SUPABASE_SERVICE_ROLE_KEY is not set; public share pages are reading " +
      "with the anon key. That works only while anonymous SELECT is still granted. " +
      "Set the key before tightening RLS or /r/[id] and /share/[id] will 404."
  );
}

export async function createPublicReadClient() {
  if (!SERVICE_KEY) return createCookieClient();

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SERVICE_KEY,
    {
      auth: {
        // No session, no refresh, no cookies. This client is not a person.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
