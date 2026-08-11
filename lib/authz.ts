// ---------------------------------------------------------------------------
// Who is allowed in (P0 — security).
//
// The decision, separated from the machinery that fetches the inputs. Access
// control is the one part of this app where a subtle mistake is not a bug but
// a breach, so the rule lives here as a pure function over plain values: an
// email, a domain, and the guest allowlist. No database, no session, nothing
// to mock — which is what makes it testable, and it is tested hard.
//
// Two rules, in order:
//   1. anyone at the organization's own domain is in;
//   2. anyone else is in only if their address is on the allowlist.
//
// Everything below exists because of how email comparison actually goes wrong.
// ---------------------------------------------------------------------------

export type AccessReason =
  | "org-domain"
  | "allowlist"
  | "no-email"
  | "not-allowed";

export type AccessDecision = {
  allowed: boolean;
  reason: AccessReason;
  /** The normalized address the decision was made about, for logging. */
  email: string;
};

/**
 * One spelling of an address, so two spellings of the same person are the same
 * person. Google will hand back `Tess@TheLoyalist.com` as readily as the
 * lowercase form, and an admin typing a guest into the allowlist will type it
 * however they please.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Is this address at the organization's domain?
 *
 * The `@` is part of the comparison and that is the whole point: matching on
 * the bare domain would admit `tess@nottheloyalist.com`, which is a domain
 * anybody can buy. Anchoring to the end likewise matters — `tess@theloyalist.com.example.net`
 * is an address at example.net, not here.
 */
export function isOrgEmail(email: string | null | undefined, domain: string): boolean {
  const e = normalizeEmail(email);
  const d = normalizeEmail(domain).replace(/^@/, "");
  if (!e || !d) return false;
  // An address has exactly one domain: whatever follows the last `@`.
  const at = e.lastIndexOf("@");
  if (at <= 0) return false;
  return e.slice(at + 1) === d;
}

/**
 * The full decision.
 *
 * `allowlist` is compared after normalizing both sides. That is not tidiness —
 * it is the fix for a failure with no error message: a guest entered as
 * `Gabby@Gmail.com ` never matches a lowercase lookup, so she is turned away
 * at the door by a system that believes it approved her.
 */
export function decideAccess(input: {
  email: string | null | undefined;
  domain: string;
  allowlist: readonly (string | null | undefined)[];
}): AccessDecision {
  const email = normalizeEmail(input.email);
  if (!email || email.lastIndexOf("@") <= 0) {
    return { allowed: false, reason: "no-email", email };
  }

  if (isOrgEmail(email, input.domain)) {
    return { allowed: true, reason: "org-domain", email };
  }

  for (const entry of input.allowlist) {
    if (normalizeEmail(entry) === email) {
      return { allowed: true, reason: "allowlist", email };
    }
  }

  return { allowed: false, reason: "not-allowed", email };
}

// ---------------------------------------------------------------------------
// Roles (multi-brand phase 2).
//
// Access decided who is in; role decides how much. Kept a pure function over the
// same plain values — email, domain, and the allowlist ROWS (each carrying an
// optional role and brand) — for the same reason the access rule is: a role that
// leaks the product side to a brand's talent is a breach, not a bug.
// ---------------------------------------------------------------------------

export type Role = "team" | "talent";

/** One allowlist row, as the role resolver needs to see it. */
export type AllowlistEntry = { email: string | null; role?: string | null; brand?: string | null };

export type MemberDecision = {
  allowed: boolean;
  role: Role;
  /** The single brand a talent is pinned to; null for team, who see all brands. */
  brand: string | null;
  reason: AccessReason;
  email: string;
};

/**
 * Who is in, and as what.
 *
 * Anyone at the org domain is team, all brands — the row-level role never
 * applies to them, so a talent entry can never accidentally demote a colleague.
 * An allowlisted address defaults to team as well: an external guest given
 * access today has full access, and nothing about them changes. A talent is the
 * new, deliberately narrower thing — role 'talent', pinned to one brand.
 */
export function resolveMember(input: {
  email: string | null | undefined;
  domain: string;
  allowlist: readonly AllowlistEntry[];
}): MemberDecision {
  const email = normalizeEmail(input.email);
  if (!email || email.lastIndexOf("@") <= 0) {
    return { allowed: false, role: "team", brand: null, reason: "no-email", email };
  }

  if (isOrgEmail(email, input.domain)) {
    return { allowed: true, role: "team", brand: null, reason: "org-domain", email };
  }

  for (const entry of input.allowlist) {
    if (normalizeEmail(entry.email) === email) {
      const isTalent = (entry.role ?? "").trim().toLowerCase() === "talent";
      const brand = (entry.brand ?? "").trim();
      // A talent with no brand set is treated as a talent with no brand — they
      // are allowed in but pinned to nothing, which the caller renders as an
      // empty ideation view rather than every brand. Better to show a talent
      // nothing than the wrong brand's boards.
      return {
        allowed: true,
        role: isTalent ? "talent" : "team",
        brand: isTalent ? brand || null : null,
        reason: "allowlist",
        email,
      };
    }
  }

  return { allowed: false, role: "team", brand: null, reason: "not-allowed", email };
}

/**
 * May the login bypass be honoured?
 *
 * The bypass is a `NEXT_PUBLIC_` flag, which means it is set in a dashboard by
 * a person in a hurry, and the failure mode of getting it wrong is the entire
 * studio's library readable by anyone with the URL. So the flag alone is not
 * enough: on a production deployment it is refused no matter what it says.
 * Turning security off has to be impossible by accident, and possible only
 * where being wrong is cheap.
 */
export function bypassAllowed(env: {
  flag?: string | null;
  vercelEnv?: string | null;
  nodeEnv?: string | null;
}): boolean {
  if (env.flag !== "true") return false;
  if (normalizeEmail(env.vercelEnv) === "production") return false;
  return true;
}
