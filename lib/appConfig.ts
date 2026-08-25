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
  /**
   * The brand a deployment falls back to if its `brands` table can't be read —
   * app-specific, so FRED never borrows the Loyalist's seed brands. On a healthy
   * deployment the real list comes from the DB and this is never seen.
   */
  defaultBrand: { slug: string; name: string };
};

const APPS: Record<AppId, AppConfig> = {
  ssync: {
    id: "ssync",
    name: "SSYNC",
    logo: "/ssync-logo.svg",
    orgDomain: "theloyalist.com",
    company: "The Loyalist",
    defaultBrand: { slug: "sous-sous", name: "SOUS SOUS" },
  },
  fred: {
    id: "fred",
    name: "FRED",
    // FRED's real wordmark — white on transparent (the nav is dark), from FRED's
    // brand kit. Tess, 2026-08-17.
    logo: "/fred-logo.png",
    // Anyone on fredathome.com is auto-approved (Tess, 2026-08-17). People off
    // that domain (a few studio Gmails) are added to FRED's app_allowlist.
    orgDomain: "fredathome.com",
    company: "FRED",
    defaultBrand: { slug: "fred", name: "FRED" },
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

/**
 * Whether the material-ordering feature (the Orders tab, and "create order" on
 * the materials library) is on for this deploy and brand.
 *
 * FRED always orders its own materials. On the Loyalist deploy it started FRED-
 * only — SOUS SOUS and Renggli said their materials often come straight from the
 * factory — but both now want the option too (Tess, 2026-08-24: "add the orders
 * tab to sourcing on the sous sous and renggli versions"). It is keyed to the
 * BRAND, not the whole deploy, so a brand that genuinely does not order can be
 * left off by simply not being in this list. The Materials library itself stays
 * on for every brand regardless.
 */
export function ordersEnabled(brand: string | null | undefined): boolean {
  return APP.id === "fred" || brand === "sous-sous" || brand === "renggli";
}
