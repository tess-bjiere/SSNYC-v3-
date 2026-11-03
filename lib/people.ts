/**
 * The two people directories: photographers and models (Tess, 2026-11-02: "add
 * photographers to ssync from deck" and "create a space for potential models to
 * be added as well").
 *
 * Both are the same thing underneath — a person is a name that recurs on rows in
 * the `references` table, and the team-entered side of them (group, notes, age,
 * agency…) rides in one `settings` jsonb map keyed by that name. There is still
 * no people TABLE, so nothing here needed a migration. What differs is which rows
 * feed a directory and which column holds the person's name:
 *
 *   photographer  campaign images (type 'editorial', credited in `photographer`)
 *                 plus the roster (type 'roster') — the directory as it was.
 *   model         rows of type 'model', the person's name in `model`. Kept out
 *                 of Campaign, the References library and Archival, exactly as
 *                 roster rows are, so a casting photo never leaks onto a wall of
 *                 inspiration.
 *
 * Dependency-free on purpose, like the rest of lib/: declares its own structural
 * row type and imports nothing.
 */

export type PeopleKind = "photographer" | "model";

export type PeopleConfig = {
  kind: PeopleKind;
  /** The settings row the cards lived under until people phase 1 (2026-11-02).
   *  Now only read to start a new person's record from the card already typed
   *  under their name (lib/peopleDb.ts); the card lives on the record. */
  metaKey: string;
  /** Row types that built the directory before people records — still what the
   *  deck import checks a name against (lib/seedPlan.ts). */
  rowTypes: readonly string[];
  /** The type a row is written with when the directory itself adds one. */
  ownType: string;
  /** Page title, and the singular / plural noun for counts and buttons. */
  title: string;
  noun: string;
  nouns: string;
  href: string;
};

export const PEOPLE: Record<PeopleKind, PeopleConfig> = {
  photographer: {
    kind: "photographer",
    metaKey: "photographers",
    rowTypes: ["editorial", "roster"],
    ownType: "roster",
    title: "Photographers",
    noun: "photographer",
    nouns: "photographers",
    href: "/photographers",
  },
  model: {
    kind: "model",
    metaKey: "models",
    rowTypes: ["model"],
    ownType: "model",
    title: "Models",
    noun: "model",
    nouns: "models",
    href: "/models",
  },
};

export function isPeopleKind(v: unknown): v is PeopleKind {
  return v === "photographer" || v === "model";
}

type RowLike = {
  id: string;
  photographer?: string | null;
  photographer_ig?: string | null;
  model?: string | null;
  location?: string | null;
  designer?: string | null;
  link?: string | null;
};

/** What the directory builder reads (lib/photographers PhotoCredit). */
export type CreditLike = {
  id: string;
  photographer: string | null;
  photographer_ig: string | null;
  location: string | null;
  designer: string | null;
};

/**
 * A row as the directory builder sees it. For a model the person is `model`,
 * and `photographer` on that row is the credit for the PICTURE — so it must not
 * become the person's name — and the photographer's IG is not the model's.
 * A model's own Instagram, when there is one, is kept in `link` instead.
 */
export function creditFor(kind: PeopleKind, r: RowLike): CreditLike {
  if (kind === "model") {
    return {
      id: r.id,
      photographer: r.model ?? null,
      photographer_ig: isInstagram(r.link) ? (r.link as string) : null,
      location: r.location ?? null,
      designer: null,
    };
  }
  return {
    id: r.id,
    photographer: r.photographer ?? null,
    photographer_ig: r.photographer_ig ?? null,
    location: r.location ?? null,
    designer: r.designer ?? null,
  };
}

export function isInstagram(u: string | null | undefined): boolean {
  return typeof u === "string" && /(^@|instagram\.com\/)/i.test(u.trim());
}

/**
 * A typed Instagram handle or URL, normalised to the stored form (a full URL —
 * the directory has always stored `photographer_ig` that way). "@ana", "ana" and
 * "instagram.com/ana/" all become "https://www.instagram.com/ana/". Empty stays
 * empty; anything that is plainly a different site is returned untouched.
 */
export function instagramUrl(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) return `https://www.instagram.com/${m[1]}/`;
  // A handle can hold dots ("emily.lipson"), so only a scheme, a path, "www." or
  // a real-looking domain ending makes it a website rather than a handle.
  const site =
    !s.startsWith("@") &&
    (/^https?:\/\//i.test(s) ||
      /^www\./i.test(s) ||
      s.includes("/") ||
      /\.(com|net|org|co|io|art|studio|agency|club|site|info|me|us|ca|uk|fr|de|nl|it|se|dk|jp|kr|au)$/i.test(s));
  if (site) return s;
  const handle = s.replace(/^@/, "").replace(/\/+$/, "");
  return handle ? `https://www.instagram.com/${handle}/` : "";
}
