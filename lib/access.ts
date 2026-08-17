import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  bypassAllowed,
  normalizeEmail,
  resolveMember,
  type AllowlistEntry,
  type MemberDecision,
  type Role,
} from "@/lib/authz";
import { isBrandSlug } from "@/lib/brands";
import { APP } from "@/lib/appConfig";

// Access control, the part that touches the world (P0 — security).
//
// The *rule* lives in lib/authz.ts, pure and tested. This file only fetches
// what the rule needs — the session and the guest allowlist — and turns the
// answer into the two shapes the app uses: a nullable user for rendering, and
// a throwing guard for anything that writes.

// The organization domain — anyone with a Google account on it is auto-approved;
// guests outside it must be added to app_allowlist. It follows the deployment's
// identity so FRED auto-approves FRED's domain and SSYNC the Loyalist's, from
// one codebase (see lib/appConfig.ts).
export const ORG_DOMAIN = APP.orgDomain;

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
  /**
   * team sees every brand and the product side; talent is pinned to one brand
   * and the ideation side only (multi-brand phase 2). See lib/authz.resolveMember.
   */
  role: Role;
  /** The brand a talent is confined to; null for team. */
  brand: string | null;
};

/**
 * The guest allowlist, read whole — now with each row's role and brand.
 *
 * Reading every row and comparing in memory looks wasteful next to a `WHERE
 * email = $1`, and it is the right call twice over. The table holds a handful
 * of guests. And an address is user-controlled text: an `ilike` lookup would
 * let a `%` in an address match rows it is not, while an exact `eq` silently
 * fails to match a row an admin typed with a capital letter. Normalizing both
 * sides in one place is the only version of this with no sharp edge.
 */
async function loadAllowlistEntries(): Promise<AllowlistEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_allowlist").select("email,role,brand");
  if (error) {
    // Fail closed. If we cannot read the allowlist we do not know who is a
    // guest, and guessing in the permissive direction is how doors get left open.
    console.warn("[access] could not read allowlist; denying guests:", error.message);
    return [];
  }
  return (data ?? []) as AllowlistEntry[];
}

/** The full membership decision for an address — allowed, role, and pinned brand. */
async function memberFor(email: string | null | undefined): Promise<MemberDecision> {
  const e = normalizeEmail(email);
  // The common case costs nothing: the org's own people never touch the table.
  const quick = resolveMember({ email: e, domain: ORG_DOMAIN, allowlist: [] });
  if (quick.allowed || quick.reason === "no-email") return quick;
  const allowlist = await loadAllowlistEntries();
  return resolveMember({ email: e, domain: ORG_DOMAIN, allowlist });
}

// Is this email allowed into the app? Org domain OR an explicit allowlist entry.
export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  return (await memberFor(email)).allowed;
}

// Returns the current signed-in + allowlisted user, or null.
//
// Wrapped in React cache() so the handful of callers that resolve the user per
// request — the layout, the brand helper, the route guards — share one auth
// call and one allowlist read rather than each making their own.
//
// In dev-bypass mode returns a placeholder user so the UI can be previewed
// before Google login is configured. The placeholder's role can be simulated
// with the ssync_dev_role cookie ("talent:renggli" | "team"), so the talent
// view is previewable — this is dev-only, and DEV_BYPASS is refused in
// production, so it can never soften a real deployment.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (DEV_BYPASS) {
    const sim = (await cookies()).get("ssync_dev_role")?.value ?? "";
    const [simRole, simBrand] = sim.split(":");
    if (simRole === "talent") {
      return {
        email: "talent@" + ORG_DOMAIN,
        name: "Preview Talent",
        role: "talent",
        brand: isBrandSlug(simBrand) ? simBrand : null,
      };
    }
    return { email: "preview@" + ORG_DOMAIN, name: "Preview User", role: "team", brand: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const member = await memberFor(user.email);
  if (!member.allowed) return null;

  return {
    email: user.email,
    name: (user.user_metadata?.full_name as string) ?? user.email,
    avatar: (user.user_metadata?.avatar_url as string) ?? null,
    role: member.role,
    brand: member.brand,
  };
});

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

/**
 * The product side — everything downstream of a factory — is team only
 * (multi-brand phase 2). A talent sees the ideation side of their brand and
 * nothing else, so every product page and every product write guards with this.
 *
 * A talent who reaches a product route is sent to their ideation home rather
 * than shown an error: they are not doing anything wrong, they have simply
 * followed a link to a part of the tool that is not theirs. redirect() works in
 * both a page and a server action, and it throws, so a caller cannot forget to
 * stop after it.
 */
export async function requireTeam(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "team") redirect("/library");
  return user;
}
