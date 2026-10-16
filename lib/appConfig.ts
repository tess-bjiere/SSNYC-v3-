// App identity — the name, logo, sign-in domain and switches of this deployment.
//
// The DATABASE the app talks to is chosen entirely by the Supabase env vars on
// its Vercel project (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY) — nothing here, and nothing else in the code,
// hardcodes which database is which. This file is the rest of the identity.
//
// 2026-10-16: this codebase used to carry a second preset for another company's
// deployment, chosen by NEXT_PUBLIC_APP. That deployment now has its own
// separate repository, so the preset and the env switch are gone (Tess,
// 2026-10-16: change any mention of it "to something unrelated"). The features
// that only ran there are still here, behind `productExtras` below, which is off.

export type AppId = "ssync";

export type AppConfig = {
  id: AppId;
  /** The wordmark and page title. */
  name: string;
  /** Logo path under /public. */
  logo: string;
  /**
   * The Google Workspace domain whose accounts are auto-approved to sign in.
   * Everyone outside it needs an app_allowlist row. This is the one value that
   * gates access.
   */
  orgDomain: string;
  /** The parent company, for footer/copy. */
  company: string;
  /**
   * The brand a deployment falls back to if its `brands` table can't be read.
   * On a healthy deployment the real list comes from the DB and this is never
   * seen.
   */
  defaultBrand: { slug: string; name: string };
  /**
   * Ideation-only deploy: show just References, Moodboard and Campaign — no
   * Product, no Sourcing (Tess, 2026-10-01: "hide product and sourcing
   * functionality. Only show references, moodboard and campaign"). The Loyalist
   * deploy carries only the SOUS SOUS and Renggli accounts, which use the tool
   * for ideation; development, factories, materials etc. are theirs to run
   * elsewhere. Nav hides the two groups and the middleware sends their routes
   * back to the library.
   */
  ideationOnly: boolean;
  /**
   * The product extras: the photographer directory, colour standards, prefixed
   * style numbers with the Category → Type picker, fabric GSM on the profile,
   * materials linked to a style and to each sample round, and new styles getting
   * a style number when none is typed. Kept in the code, switched off here —
   * every place that used to check for the other deployment checks this instead.
   */
  productExtras: boolean;
};

export const APP: AppConfig = {
  id: "ssync",
  name: "SSYNC",
  logo: "/ssync-logo.svg",
  orgDomain: "theloyalist.com",
  company: "The Loyalist",
  defaultBrand: { slug: "sous-sous", name: "SOUS SOUS" },
  ideationOnly: true,
  productExtras: false,
};

/**
 * Whether the material-ordering feature (the Orders tab, and "create order" on
 * the materials library) is on for this deploy and brand.
 *
 * It started with the product extras only — SOUS SOUS and Renggli said their
 * materials often come straight from the factory — but both now want the option
 * too (Tess, 2026-08-24: "add the orders tab to sourcing on the sous sous and
 * renggli versions"). It is keyed to the BRAND, not the whole deploy, so a brand
 * that genuinely does not order can be left off by simply not being in this
 * list. The Materials library itself stays on for every brand regardless.
 */
export function ordersEnabled(brand: string | null | undefined): boolean {
  return APP.productExtras || brand === "sous-sous" || brand === "renggli";
}
