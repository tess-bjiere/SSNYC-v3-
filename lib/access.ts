import { createClient } from "@/lib/supabase/server";
import { bypassAllowed, decideAccess, normalizeEmail } from "@/lib/authz";

// Access control, the part that touches the world (P0 — security).
//
// The *rule* lives in lib/authz.ts, pure and tested. This file only fetches
// what the rule needs — the session and the guest allowlist — and turns the
// answer into the two shapes the app uses: a nullable user for rendering, and
// a throwing guard for anything that writes.

// The organization domain — anyone with an @theloyalist.com Google account is
// auto-approved. Guests outside this domain must be added to app_allowlist.
export const ORG_DOMAIN = "theloyalist.com";

/**
 * Is login bypassed?
 *
 * Note this is not simply the environment variable. A `NEXT_PUBLIC_` flag left
 * switched on is the single cheapest way to publish the studio's whole library
 * by accident, so on a production deployment the bypass is refused no matter
 * what the flag says. See `bypassAllowed` for the reasoning.
 */
export const DEV_BYPASS = bypassAllowed({
  flag: process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
});

/** True when someone asked for the bypass and it was refused — worth saying out loud. */
export const DEV_BYPASS_REFUSED =
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" && !DEV_BYPASS;

export type SessionUser = {
  email: string;
  name?: string | null;
  avatar?: string | null;
};

/**
 * The guest allowlist, read whole.
 *
 * Reading every row and comparing in memory looks wasteful next to a `WHERE
 * email = $1`, and it is the right call twice over. The table holds a handful
 * of guests. And an address is user-controlled text: an `ilike` lookup would
 * let a `%` in an address match rows it is not, while an exact `eq` silently
 * fails to match a row an admin typed with a capital letter. Normalizing both
 * sides in one place is the only version of this with no sharp edge.
 */
async function loadAllowlist(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_allowlist").select("email");
  if (error) {
    // Fail closed. If we cannot read the allowlist we do not know who is a
    // guest, and guessing in the permissive direction is how doors get left open.
    console.warn("[access] could not read allowlist; denying guests:", error.message);
    return [];
  }
  return (data ?? []).map((r) => (r as { email: string | null }).email ?? "");
}

// Is this email allowed into the app? Org domain OR an explicit allowlist entry.
export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  const e = normalizeEmail(email);
  if (!e) return false;

  // The common case costs nothing: the org's own people never touch the table.
  const quick = decideAccess({ email: e, domain: ORG_DOMAIN, allowlist: [] });
  if (quick.allowed) return true;
  if (quick.reason === "no-email") return false;

  const allowlist = await loadAllowlist();
  return decideAccess({ email: e, domain: ORG_DOMAIN, allowlist }).allowed;
}

// Returns the current signed-in + allowlisted user, or null.
// In dev-bypass mode returns a placeholder user so the UI can be previewed
// before Google login is configured.
export async function getSessionUser(): Promise<SessionUser | null> {
  if (DEV_BYPASS) {
    return { email: "preview@" + ORG_DOMAIN, name: "Preview User" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  if (!(await isEmailAllowed(user.email))) return null;

  return {
    email: user.email,
    name: (user.user_metadata?.full_name as string) ?? user.email,
    avatar: (user.user_metadata?.avatar_url as string) ?? null,
  };
}

/**
 * The same question, asked where the answer must be yes.
 *
 * Redirecting an unauthenticated visitor in the app layout protects *pages*.
 * It does not protect Server Actions: those compile to POST endpoints a caller
 * reaches directly, without ever rendering the layout that was supposed to
 * have stopped them. So every action that reads or writes studio data calls
 * this first, and the grep for it is the audit — a mutation without this line
 * is a mutation anyone on the internet can perform.
 *
 * It throws rather than returning null on purpose. A guard that can be ignored
 * by forgetting to check a return value is not a guard.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Not signed in. Sign in again and retry.");
  }
  return user;
}
