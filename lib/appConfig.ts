// App identity — what makes this deployment SSYNC or FRED.
//
// Tess, 2026-08-17: "create a duplicate of this tool for FRED ... i dont want it
// to share databases with the loyalist since they are different parent companies
// ... a way to easily update the FRED and SSYNC functionality as i go."
//
// The answer is ONE codebase, two live apps. The DATABASE each app talks to is
// chosen entirely by the Supabase env vars on its Vercel project
// (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY) — nothing
// here, and nothing else in the code, hardcodes which database is which, so the
// two companies' data never meet. This file is the REST of the identity: the
// name, the logo, the sign-in domain — the handful of things that are "SSYNC"
// on one deploy and "FRED" on the other. Which preset a build uses is set once,
// per Vercel project, with NEXT_PUBLIC_APP.
//
// So a feature written once ships to both (they share this code); only the two
// presets below, and the two sets of env vars, tell them apart.

export type AppId = "ssync" | "fred";

export type AppConfig = {
  id: AppId;
  /** The wordmark and page title. */
  name: string;
  /** Logo path under /public. */
  logo: string;
  /**
   * The Google Workspace domain whose accounts are auto-approved to sign in.
   * Everyone outside it needs an app_allowlist row. This is the one value that
   * gates access, so FRED's must be set to FRED's real domain before it goes
   * live — until then FRED's team signs in only via the allowlist.
   */
  orgDomain: string;
  /** The parent company, for footer/copy. */
  company: string;
};

const APPS: Record<AppId, AppConfig> = {
  ssync: {
    id: "ssync",
    name: "SSYNC",
    logo: "/ssync-logo.svg",
    orgDomain: "theloyalist.com",
    company: "The Loyalist",
  },
  fred: {
    id: "fred",
    name: "FRED",
    // FRED's real wordmark — white on transparent (the nav is dark), from FRED's
    // brand kit. Tess, 2026-08-17.
    logo: "/fred-logo.png",
    // TODO(FRED): set FRED's real Google Workspace domain before launch. Until
    // then no one is auto-approved and FRED's team signs in via the allowlist.
    orgDomain: "fred.invalid",
    company: "FRED",
  },
};

/** ssync unless NEXT_PUBLIC_APP is exactly "fred" — an unknown value is never a
 *  reason to serve the wrong brand's identity. */
function resolveAppId(raw: string | null | undefined): AppId {
  return raw === "fred" ? "fred" : "ssync";
}

/**
 * The identity for THIS deployment. NEXT_PUBLIC_APP is inlined at build time, so
 * each Vercel project bakes in its own identity — SSYNC or FRED — and this is a
 * constant at runtime, safe to read on the server and the client alike.
 */
export const APP: AppConfig = APPS[resolveAppId(process.env.NEXT_PUBLIC_APP)];
