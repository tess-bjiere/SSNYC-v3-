// Fetching a brand's WIP sheet from Google Drive, server-side only.
//
// Tess, 2026-08-06: "can we set-up the google credentials to pull from?"
//
// Yes — and the shape of the answer matters more than the code. SSYNC reads
// Drive as a service account: a machine identity with no Drive of its own,
// which can see exactly the files a person has explicitly shared with it and
// nothing else. Share the WIP with it as a Viewer and it can read the WIP.
// Nothing else in the Loyalist Drive is reachable, not because the code is
// careful but because the permission does not exist.
//
// That is a better fit here than signing people in with Google, for a reason
// specific to this feature: the sheet is Kara's, the styles are Tess's, and a
// per-person token would mean the panel worked or failed depending on who was
// looking at the style. A service account reads the same sheet for everyone, or
// for no one.
//
// It also lines up with lib/wipSources.ts. That file says a style may only be
// filled from its own brand's sheet; this one means the app physically cannot
// open a sheet nobody shared. The rule is stated in code and enforced in
// Google's permission model, which is the pair you want.
//
// Nothing here runs without both environment variables. Absent them every entry
// point returns "not configured" and the app behaves exactly as it does today —
// the paste-and-upload path stays the primary one and does not depend on any of
// this.

import { createSign } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { readZip } from "./zip";
import { readWorkbook } from "./xlsx";
import { parseWipRows, type WipEntry } from "./wipImport";
import type { WipSource } from "./wipSources.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Read-only, and only Drive. The narrowest scope that can do the job; a
// read-write scope would let a bug in this file damage the sheet the whole
// company works from.
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export type GoogleCreds = { email: string; key: string };

/**
 * The service account, or null when it has not been set up.
 *
 * The private key is stored with literal \n sequences because that is the only
 * way a PEM survives being pasted into a Vercel environment variable field.
 */
export function googleCreds(): GoogleCreds | null {
  const email = (process.env.GOOGLE_SA_EMAIL ?? "").trim();
  const key = (process.env.GOOGLE_SA_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!email || !key) return null;
  return { email, key };
}

export function wipConfigured(): boolean {
  return googleCreds() !== null;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Tokens last an hour; asking for a fresh one on every keystroke would be both
// slow and rude to Google. Kept in module scope, which in a serverless function
// means "for the life of this instance" — a cache that empties itself.
let cached: { token: string; expires: number } | null = null;

async function accessToken(creds: GoogleCreds): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expires > now + 60) return cached.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: creds.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(creds.key))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google refused the service account (${res.status}). Check the key and that the Drive API is enabled.`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google returned no access token.");
  cached = { token: json.access_token, expires: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

export type WipPull =
  | {
      ok: true;
      entries: WipEntry[];
      sheetName: string;
      fileName: string;
      /** When these bytes were read. A WIP sheet changes hourly; the panel says so. */
      fetchedAt: string;
    }
  | { ok: false; configured: boolean; reason: string };

/**
 * Read one source's sheet and parse it.
 *
 * The workbook may hold several tabs — Drop 1, Drop 2, a trim library, an old
 * season somebody kept. Rather than guessing by name, every tab is parsed and
 * the one that yields the most style rows wins. A tab that is not a WIP grid
 * yields nothing and so cannot win, which is a more durable rule than matching
 * a tab title that a person will eventually rename.
 */
export async function pullWip(source: WipSource | null | undefined): Promise<WipPull> {
  if (!source) return { ok: false, configured: wipConfigured(), reason: "No WIP sheet is bound to this brand." };
  const creds = googleCreds();
  if (!creds) {
    // Naming the two variables is the difference between a message that stops
    // you and one you can act on. The half-set case is called out separately
    // because it is the one that reads as configured from the Vercel dashboard
    // and as unconfigured from in here, and a person looking at a screen that
    // plainly shows a Google variable will not believe a message that says
    // there is none.
    const email = (process.env.GOOGLE_SA_EMAIL ?? "").trim();
    const key = (process.env.GOOGLE_SA_PRIVATE_KEY ?? "").trim();
    const missing = !email && !key
      ? "GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY are not set on this deployment."
      : !email
        ? "GOOGLE_SA_PRIVATE_KEY is set but GOOGLE_SA_EMAIL is not, so there is nobody to sign as."
        : "GOOGLE_SA_EMAIL is set but GOOGLE_SA_PRIVATE_KEY is not, so nothing can be signed.";
    return {
      ok: false,
      configured: false,
      reason: `${missing} Add them in Vercel and redeploy — variables are read at boot, so one added to a running deployment does nothing until the next. Setup lists this too. Pasting the rows works either way.`,
    };
  }

  try {
    const token = await accessToken(creds);
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(source.fileId)}?alt=media&supportsAllDrives=true`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 404 || res.status === 403) {
      return {
        ok: false,
        configured: true,
        reason: `${source.fileName} has not been shared with ${creds.email}. Share it as a Viewer and try again.`,
      };
    }
    if (!res.ok) return { ok: false, configured: true, reason: `Drive returned ${res.status}.` };

    const bytes = new Uint8Array(await res.arrayBuffer());
    const entries = readZip(bytes, (b) => new Uint8Array(inflateRawSync(b)));
    const book = readWorkbook(entries);

    let best: { name: string; rows: WipEntry[] } = { name: "", rows: [] };
    for (const sheet of book.sheets) {
      const parsed = parseWipRows(sheet.rows, source);
      if (parsed.length > best.rows.length) best = { name: sheet.name, rows: parsed };
    }
    if (!best.rows.length) {
      return { ok: false, configured: true, reason: `No style rows found in ${source.fileName}.` };
    }

    return {
      ok: true,
      entries: best.rows,
      sheetName: best.name,
      fileName: source.fileName,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, configured: true, reason: e instanceof Error ? e.message : "Could not read the sheet." };
  }
}
