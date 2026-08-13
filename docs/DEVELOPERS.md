# SSYNC — Developer & Operations Guide

**For Lorne & Max.** This is the manual for running and extending SSYNC: how the
pieces fit together, how to make a change and ship it, how to touch the database
safely, and how to build the two integration tracks Tess wants next — the
Google-Sheet sync (techpacks, WIPs, TL Opps) and the AI features (sketch editing
and AI summaries).

Read the **Golden rules** section before you touch anything. The rest you can
skim and come back to.

> Companion doc: `CLAUDE.md` in the repo root is the same material written for the
> AI coding assistant. If the two ever disagree, `CLAUDE.md` is the source of
> truth for code conventions and this file is the source of truth for ops.

---

## 1. The whole system on one page

SSYNC is a **Next.js 15 / React 19 / TypeScript** app. It has exactly three
moving services:

```
   You edit code
        │
        ▼
   ┌─────────┐   push to `main`   ┌─────────┐   reads/writes   ┌──────────┐
   │ GitHub  │ ─────────────────▶ │ Vercel  │ ───────────────▶ │ Supabase │
   │ (source)│   auto-deploys     │ (hosts) │                  │ (Postgres│
   └─────────┘                    └─────────┘                  │ + files) │
                                       │                        └──────────┘
                                       ▼
                                  live site:
                              https://ssync-two.vercel.app
```

- **GitHub** — `github.com/tess-bjiere/SSNYC-v3-`. The code. Deploys happen from
  the **`main`** branch.
- **Vercel** — hosts the app and holds all the secret keys (environment
  variables). **Every push to `main` triggers a production deploy automatically.**
  There is no separate "deploy" button to press.
- **Supabase** — the Postgres database *and* file storage. Project id
  `axwavdjhzvtluvsixfjq`. This is where every reference, style, sample round,
  comment, moodboard and linesheet lives.

Everything else (the Google Sheets, the AI APIs) hangs off the app as an
integration — the app calls out to them; they don't host anything.

---

## 2. Golden rules (do not skip)

These are the things that will hurt if you get them wrong. They are copied from
how the app is already built — follow them.

1. **The database is live and it is the only copy.** There is no staging
   database and, until Supabase is upgraded to Pro, no automatic backup. A bad
   `delete from` or `drop column` loses studio data for good. Treat every write
   to production Supabase as irreversible.

2. **Nothing is ever hard-deleted — everything soft-deletes.** Styles,
   references, versions, comments, linesheets: they all have a `deleted_at`
   column. "Deleting" sets a timestamp; "restoring" sets it back to `null`. If
   you're about to write `delete from` or `drop column`, stop — you're about to
   be wrong.

3. **`db/p0-rls.sql` must never be run casually.** It closes the row-level
   security policies. Run in the wrong order it makes every page render empty and
   every link 404 — it *looks* exactly like a broken deploy. Only run it when
   Tess says so, in words, that specific time.

4. **Schema changes are additive and nullable only, and announced.** Adding a
   new nullable column is fine and normal. Renaming or dropping a column, or
   making an existing column `not null`, can break the live app. Say what you're
   adding and why, in the migration's own comment and in the PR.

5. **`styles.photos` and `style_samples.photos` are shared jsonb maps — never
   rebuild them from scratch.** One jsonb blob holds several things at once
   (photography slots, the `gallery` list, the `colorways` list, image notes).
   Every writer reads the whole map and writes back a new one carrying through
   the keys it didn't touch (see `lib/imageList.ts` / `lib/photoSlots.ts`). A
   write that rebuilds the map deletes a photoshoot. This is the single most
   dangerous thing in the codebase.

6. **Never commit a secret.** API keys, tokens, service-account keys, passwords —
   none of these ever go in the code or in git. They go in **Vercel's
   environment variables** (for production) and in a local **`.env.local`** file
   (which git ignores). See §6.

7. **The app never sends mail or messages a factory unattended.** Notifications
   go through a mailer Tess configured. Don't add code that emails a factory on
   its own.

---

## 3. Accounts you'll need

Ask Tess to invite you to:

- **GitHub** — collaborator on `tess-bjiere/SSNYC-v3-`.
- **Vercel** — member of the project that deploys the repo (this is where you'll
  add environment variables and watch deploys).
- **Supabase** — member of the `axwavdjhzvtluvsixfjq` project (SQL editor, table
  editor, storage, logs).
- **Google Cloud** (only for the Sheets integration, §7) — access to the service
  account that reads the studio's Drive.

You do **not** need Tess to hand you raw keys in a message. Add yourself to
Vercel/Supabase and read the values from their dashboards.

---

## 4. Run it locally

Prereqs: **Node 20+** and `npm`.

```bash
git clone https://github.com/tess-bjiere/SSNYC-v3-.git
cd SSNYC-v3-
npm install
cp .env.local.example .env.local   # then fill in the values (see below)
npm run dev                         # http://localhost:3000
```

Fill `.env.local` from `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://axwavdjhzvtluvsixfjq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key from Supabase → Project Settings → API>
NEXT_PUBLIC_DEV_BYPASS_AUTH=true    # dev only: skip Google login locally
```

Two useful local modes:

- **`NEXT_PUBLIC_DEV_BYPASS_AUTH=true`** — skips the Google login so you can click
  around locally. Leave it unset / `false` in production.
- **`NEXT_PUBLIC_MOCK=1`** — runs the whole UI against built-in demo data with **no
  database at all**. Great for previewing UI and print/PDF layouts safely:

  ```bash
  PORT=4192 NEXT_PUBLIC_MOCK=1 npm run dev
  ```

  In mock mode the pages read from `lib/mock.ts` instead of Supabase. This is the
  safe sandbox — you can't touch real data.

> ⚠️ Your local dev server with real (non-mock) env vars points at the **live
> production database**. There is no local database. Any write you make locally
> is a write to production. Use `NEXT_PUBLIC_MOCK=1` whenever you don't
> specifically need real data.

---

## 5. The change → ship loop

```
branch → edit → test locally → open PR → merge to main → Vercel auto-deploys
```

Concretely:

```bash
git checkout -b my-change
# ...edit files...
npx tsc --noEmit        # typecheck — must be clean
npm test                # unit tests — must pass
npm run build           # production build — catches things tsc misses
git add -A && git commit -m "Describe the change"
git push -u origin my-change
```

Then open a PR on GitHub, review, and **merge to `main`**. Merging to `main` is
what deploys — Vercel picks it up within ~1–2 minutes and pushes it to
`https://ssync-two.vercel.app`. Watch the deploy in the Vercel dashboard; if the
build fails there, the old version stays live (Vercel won't promote a broken
build).

**Always run all three checks before merging** (`tsc`, `test`, `build`). The
build in particular catches errors `tsc` alone does not.

Roll back a bad deploy from the **Vercel dashboard → Deployments → (pick the last
good one) → Promote to Production**. Or revert the commit on `main` and let it
redeploy.

> **To-do — custom domain.** The app currently lives at the default Vercel URL
> `ssync-two.vercel.app`. We should move it to a proper **SSYNC / The Loyalist**
> domain (e.g. `ssync.theloyalist.com` or a dedicated `ssync.*`). Set it up in
> **Vercel → Project → Settings → Domains** (add the domain, then add the DNS
> record it shows you at the registrar). Nothing in the code needs to change —
> update any hard-coded links afterwards (search the repo for `ssync-two.vercel.app`).

---

## 6. Environment variables & secrets

**Where secrets live:**

- **Production** → Vercel → Project → **Settings → Environment Variables**. Add
  the key there, then **redeploy** for it to take effect (Vercel bakes env vars
  in at build time for `NEXT_PUBLIC_*`, and reads server-only ones at runtime).
- **Local** → `.env.local` (git-ignored). Never commit it.

**Naming rule:** anything prefixed `NEXT_PUBLIC_` is shipped to the browser and
is **not secret**. Everything without that prefix stays server-side. **API keys
and service-account keys must NOT have the `NEXT_PUBLIC_` prefix** — that would
leak them to every visitor. Keys go in as plain (server-only) variables and are
only ever read in server code (route handlers, server actions, `lib/*` running on
the server).

Current / expected variables:

| Variable | Where | Secret? | What it's for |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | no | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | no (public by design) | Supabase client key (RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel only | **yes** | Full DB access for server-only admin tasks. Never expose. |
| `GOOGLE_SA_EMAIL` | Vercel only | yes-ish | Service account that reads the studio Drive (§7) |
| `GOOGLE_SA_PRIVATE_KEY` | Vercel only | **yes** | Private key for that service account (§7) |
| `ANTHROPIC_API_KEY` | Vercel only | **yes** | Claude API, for AI summaries (§8) |
| `OPENAI_API_KEY` | Vercel only | **yes** | OpenAI image model (`gpt-image-1`) for sketch editing (§8b) |
| `TL_OPPS_API_URL` / `TL_OPPS_API_KEY` | Vercel only | **yes** | TL Opps push endpoint + auth, *if* TL Opps exposes an API (§7b) |

Tess pastes her own credentials into Vercel/Supabase. If you need a new key
(e.g. the Anthropic key), you can create it in that provider's dashboard and add
it to Vercel yourself — you don't have to route it through Tess in a chat.

---

## 7. Reading from Google Sheets (techpacks & WIPs)

This is the **inbound** track — pulling data *into* SSYNC from the studio's
Google Sheets (a brand's WIP, a techpack sheet). Good news: **the reader already
exists in the codebase** and is architected exactly for adding more sheets.
You'll be extending it, not building from zero. (Pushing data *out* to TL Opps is
a different track — see §7b.)

### What's already there

The "Pull from WIP" feature reads a brand's Work-In-Progress spreadsheet out of
the studio's Google Drive and proposes values for a style (fabric, colors,
factory, tech-pack URL, …). It is **built, tested, and currently switched off**
pending the Google credentials. The pieces:

| File | Role |
|---|---|
| `lib/wipSources.ts` | The **allowlist of sheets** — which brand may read which sheet, and the column map for each. Pure/tested. |
| `lib/wipImport.ts` | Turns a parsed sheet into proposed style values. Pure/tested. |
| `lib/xlsx.ts` / `lib/zip.ts` | Parse a real `.xlsx` file (Kara's SOUS SOUS WIP is an Excel file in Drive, not a native Google Sheet — the app opens the zip and reads the XML itself). |
| `lib/googleDrive.ts` | The edge — authenticates with the Google service account and fetches the file. |
| `app/actions/wip.ts` | The server action the UI calls. |

**The key safety rule here is already enforced in `lib/wipSources.ts`:** a brand
can only ever read from the sheet its brand is bound to. Several brands share one
Drive and their sheets reuse column names and style-number prefixes, so a reader
pointed at "whatever it can find" would quietly put one brand's fabric on
another brand's style. The binding is a **named list of sources**, not a search.
Keep it that way.

### To switch it on

1. In **Google Cloud**, use (or create) a **service account** with read access
   to the studio's Drive, and share the relevant Drive folder/files with that
   service account's email.
2. Add `GOOGLE_SA_EMAIL` and `GOOGLE_SA_PRIVATE_KEY` to **Vercel** (server-only).
3. Un-comment the "Pull from WIP" panel on the style profile (it's commented out
   with a note naming the lines that put it back — search the style profile
   component for "Pull from WIP").

### To add a new sheet (a techpack sheet, another brand's WIP)

Add a new entry to the source list in `lib/wipSources.ts` — a brand key, the
Drive file id / name, and the column map (which spreadsheet column feeds which
SSYNC field). **Nothing else in the reader changes** — that's the whole point of
the design. Then add a unit test in `lib/wipSources.test.mts` pinning the new
column map, and verify against a copy of the real sheet.

- **Techpack sheet** → likely maps a style number → a tech-pack URL (and maybe
  fabric/notes). Add it as a source with those columns.

---

## 7b. Pushing style info to TL Opps (outbound)

**TL Opps is The Loyalist's internal production/brands tool.** Tess wants SSYNC
to be able to **push style info out to TL Opps** — the opposite direction from
§7. This is a *new* capability (the WIP reader only reads), and it's an
**outbound side effect**, so treat it with the same care as sending anything to
an external system.

> **Lorne, you own both ends of this.** You're the TL Opps developer, so you
> already know how TL Opps ingests records — and if it doesn't have an ingestion
> path yet, you can add the right one on the TL Opps side and the matching push on
> the SSYNC side. That makes you the ideal person for this. The SSYNC side below
> is the same server-action pattern as every other write in this app; the only
> real design decision is the ingestion path (which you already know) and the
> field mapping (which you'll define — loop Tess in on *which* fields matter).

### The ingestion path — you already know which of these TL Opps uses

The SSYNC plumbing depends on how TL Opps ingests records:

| If TL Opps has… | SSYNC pushes by… | Notes |
|---|---|---|
| **An HTTP API / webhook** (a URL you can POST JSON to) | A server action that `POST`s the style payload to that endpoint, authenticating with a token stored in Vercel (`TL_OPPS_API_URL`, `TL_OPPS_API_KEY`). | **Preferred** — clean boundary, TL Opps owns its own validation. |
| **A shared Supabase / database** | A server action that upserts into TL Opps's table with the service-role client. | Only if TL Opps is genuinely the same/accessible DB. Cross-app DB writes are brittle — prefer an API if one exists. |
| **A Google Sheet backing it** | The **Google Sheets API** (append/update rows) — not the Drive `.xlsx` *reader* in §7, which is read-only. Reuse the same `GOOGLE_SA_*` service account, given write access to that sheet. | Idempotent upsert keyed on style number (see below). |

If TL Opps has no ingestion path yet, add one on the TL Opps side first (an
endpoint is cleanest) — then the SSYNC side below just calls it.

### The SSYNC side, once the ingestion path is known

Build it the same way every other write in this app is built — as a **server
action** (`app/actions/tlOpps.ts`) with the mapping logic factored into a pure,
tested `lib/tlOpps.ts`:

1. `lib/tlOpps.ts` (pure) builds the **payload** from a style — decide with Tess
   which fields TL Opps wants. Likely: style number, name, garment, fabric,
   colors, factory, season, status/stage, tech-pack URL, and maybe the cover
   image URL. Unit-test the mapping.
2. `app/actions/tlOpps.ts` (server action) `requireUser()`, builds the payload
   with `lib/tlOpps.ts`, and sends it (POST / DB upsert / Sheets append per the
   table above). Keys come from Vercel env vars — never the browser.
3. A button on the style profile ("Push to TL Opps") calls the action, or it
   fires on a state change (e.g. when a style is approved / moved to production).

### Rules for the push (important)

- **Idempotent — upsert, don't append.** Key on the **style number** so pushing
  the same style twice *updates* the TL Opps record instead of creating a
  duplicate. Re-pushing after an edit should be safe.
- **Brand-scoped.** A brand's push only ever writes that brand's records into TL
  Opps — same discipline as the WIP reader's per-brand binding. Don't let one
  brand's action touch another brand's rows.
- **Explicit, not silent.** Trigger it from a user action or a clear, agreed
  state change — never on a hidden timer. An outbound push is a side effect the
  studio should be able to see happen. (This mirrors Golden rule #7 about not
  sending things unattended.)
- **Confirm the exact field mapping with Tess** before shipping — SSYNC's field
  names won't match TL Opps's one-to-one, and getting a field wrong writes bad
  data into a live production tool.
- Start with a **manual "Push to TL Opps" button** and get the mapping right
  there before considering any automatic trigger.

**Rule of thumb for this track:** reads are safe and additive; writes to an
external sheet are outward-facing side effects — build them behind an explicit
user action (a button the studio presses), never on a timer, and confirm the
mapping with Tess before shipping.

---

## 8. AI features: sketch editing + AI summaries

Two separate integrations. Both follow the **same architecture**, which is the
important part:

> **All AI calls run server-side. The API key never reaches the browser.**
> The pattern in this app is: a pure, testable module in `lib/` builds the
> prompt/request; a **route handler** (`app/api/.../route.ts`) or a **server
> action** (`app/actions/*.ts`) makes the actual API call using the key from a
> server-only env var; the client component just calls that route/action.

There's already a live example of a server route to copy the shape from:
[`app/api/img/route.ts`](../app/api/img/route.ts) (an image proxy). AI routes
look the same — receive input, do the server-side work, return JSON.

### 8a. AI summaries — Claude (Anthropic API)

Use the official **Anthropic SDK**. This generates the "AI summary" text — a
plain-English summary of a style. **For now, scope it to the style profile only**
(Tess, 2026-08-12: "AI summaries should just be on the style profile for now") —
a "Summarize" button on the style profile that summarizes that style and its
sample rounds. Other surfaces (linesheets, fitting decks) can come later.

**Setup**

```bash
npm install @anthropic-ai/sdk
```

Add `ANTHROPIC_API_KEY` to Vercel (server-only, no `NEXT_PUBLIC_` prefix). Create
a key at the Anthropic Console.

**Model choice.** Summaries are high-volume and cost-sensitive. Anthropic's
current line-up (Jan 2026):

| Model | Model ID | Good for |
|---|---|---|
| Claude Opus 4.8 / Opus 5 | `claude-opus-4-8` / `claude-opus-5` | Highest quality, most expensive — reserve for hard reasoning, not bulk summaries |
| Claude Sonnet 5 | `claude-sonnet-5` | Strong quality at ~⅕ Opus cost — a good default for summaries |
| Claude Haiku 4.5 | `claude-haiku-4-5` | Fastest and cheapest — great for short, high-volume summaries |

For studio summaries, start with **`claude-sonnet-5`** (or `claude-haiku-4-5` if
volume is high and the summaries are short), and only reach for Opus if quality
isn't good enough. Pricing and the newest IDs are on the Anthropic Console — check
there before committing, since the line-up moves.

**Shape (a route handler)** — `app/api/summarize/route.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { buildSummaryPrompt } from "@/lib/aiSummary"; // pure + testable

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the env

export async function POST(request: Request) {
  const { style } = await request.json();
  const prompt = buildSummaryPrompt(style); // all the judgement lives in lib/, unit-tested

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  return NextResponse.json({ summary: text });
}
```

Keep `buildSummaryPrompt` (and any parsing of the result) in `lib/aiSummary.ts`
so it's covered by the same `node --test` suite as the rest of `lib/` — the API
call itself stays thin and in the route. Never call Anthropic from a client
component.

> Anthropic ships a `claude-api` reference (models, params, streaming, tool use,
> caching). If you have Claude Code, ask it — it can pull the exact current model
> IDs and SDK syntax. For long summaries, stream the response so you don't hit
> request timeouts.

### 8b. Sketch editing — OpenAI's image model (ChatGPT / GPT Image)

This edits a style's sketch in-app (image-to-image: take the existing sketch +
an instruction like "make the sleeves longer", get back an edited image).

**Anthropic/Claude does not generate or edit images** — it's text + vision only.
The sketch editor uses **OpenAI's image model** (the same "GPT Image" model
behind ChatGPT's image editing — `gpt-image-1` as of early 2026). Its **image
edit** endpoint takes an existing image + a text instruction (and an optional
mask) and returns an edited image — exactly the image-to-image flow we want.

**Setup**

```bash
npm install openai
```

Add `OPENAI_API_KEY` to **Vercel** (server-only — no `NEXT_PUBLIC_` prefix).
Create the key in the OpenAI dashboard.

**Same architecture as the summaries route** — server-side, key never in the
browser:

1. Client sends the sketch (or its stored URL) + the instruction to a server
   route, e.g. `app/api/edit-sketch/route.ts`.
2. The route reads the image and calls OpenAI's image-edit endpoint.
3. The route stores the result in **Supabase storage** and records it on the
   style's `photos` jsonb — **through the existing `lib/imageList.ts` writers so
   the carry-through rule (Golden rule #5) is respected.** Do not hand-write the
   `photos` map.
4. The route returns the new image URL; the client shows it.

**Shape** — `app/api/edit-sketch/route.ts`:

```ts
import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI(); // reads OPENAI_API_KEY from the env

export async function POST(request: Request) {
  const { imageUrl, instruction } = await request.json();

  // fetch the existing sketch as a file for the edit endpoint
  const src = await fetch(imageUrl);
  const image = await toFile(Buffer.from(await src.arrayBuffer()), "sketch.png", {
    type: "image/png",
  });

  const result = await client.images.edit({
    model: "gpt-image-1",
    image,                 // the current sketch (optionally add a `mask`)
    prompt: instruction,   // e.g. "make the sleeves longer, keep everything else"
    size: "1024x1024",
  });

  const b64 = result.data[0].b64_json; // gpt-image-1 returns base64
  // → decode, upload to Supabase storage, then attach the URL to styles.photos
  //   via lib/imageList.ts (NOT a raw jsonb write). Return the new URL.
  return NextResponse.json({ b64 });
}
```

Because the edited image becomes part of `styles.photos`, the storage step must
go through `lib/imageList.ts` / `lib/photoSlots.ts` — add the result as a **new**
colorway/gallery entry (or a dedicated "AI edit" slot), never replacing the whole
map. Keeping the original sketch is important; the edit is a new image, not an
overwrite.

**Cost/UX note:** image edits are slow (seconds) and cost per call. Make it an
explicit button, show a loading state, and store the result so it isn't
regenerated on every view. Model names and endpoint details move — check
OpenAI's current image docs before shipping, since `gpt-image-1` may be
superseded.

**Cost/UX note:** image edits are slow (seconds) and cost per call. Make it an
explicit user action (a button), show a loading state, and store the result so
it's not regenerated on every view.

---

## 9. Testing & verification

- **`npx tsc --noEmit`** — type errors.
- **`npm test`** — the pure-logic unit suite. It runs
  `node --experimental-strip-types --test lib/*.test.mts` in a few seconds with
  no build step. **The rule: `lib/*.ts` is pure and dependency-free** (no React,
  no Supabase, no node builtins) so it can be tested this fast. Put judgement
  there, test it there. Impure things (DB, network, the Google/AI calls) live in
  routes/actions and at the edges.
- **`npm run build`** — the production build; catches what `tsc` misses.
- **Preview UI safely** with `NEXT_PUBLIC_MOCK=1` (see §4).
- **Print/PDF layouts** (linesheets, fitting deck) can be verified by printing a
  page to PDF with headless Chrome and eyeballing the output — ask Claude Code if
  you want the exact command; it's the workflow already used for the export work.

All three checks should be green before you merge to `main`.

---

## 10. How the code is organised

```
app/(app)/…     the signed-in application (pages)
app/actions/…   server actions — every write to the DB goes through one
app/api/…       route handlers (the img proxy today; AI routes go here)
lib/…           the decisions, as pure + tested modules
db/…            SQL migrations, applied by hand in the Supabase SQL editor
```

- **Server actions (`app/actions/*`) are the only place writes happen.** They
  `requireUser()`, read the current data, apply a pure `lib/*` helper, and write
  back. New DB features follow this shape.
- **`lib/*` is pure and dependency-free on purpose** (see §9). If you're adding
  business logic, it goes here with a test.
- **`db/*.sql`** files are applied **by hand in the Supabase SQL editor** — they
  are not run automatically. Each one opens with a comment saying what was asked
  for and why. When you add a migration: additive + nullable, comment it, apply
  it in Supabase, and note it in the PR.

---

## 11. Common tasks (quick runbook)

| Task | How |
|---|---|
| Ship a code change | branch → `tsc`/`test`/`build` → PR → merge `main` → Vercel deploys |
| Roll back a bad deploy | Vercel → Deployments → promote the last good one |
| Add a config/secret | Vercel → Settings → Environment Variables → redeploy |
| Add a DB column | write `db/pNN-*.sql` (additive+nullable, commented) → run it in Supabase SQL editor → note in PR |
| Preview UI with no data | `PORT=4192 NEXT_PUBLIC_MOCK=1 npm run dev` |
| Add a Google Sheet source | new entry in `lib/wipSources.ts` + a test → verify against the real sheet |
| Add an AI feature | pure prompt/logic in `lib/` + a server route in `app/api/` using a server-only key |
| See DB errors / logs | Supabase → Logs; Vercel → the deploy's Runtime Logs |

---

## 12. Open questions to confirm with Tess

Nail these down before building the integration tracks — a couple of terms in the
brief are ambiguous:

1. **Which style fields does TL Opps want?** The TL Opps push (§7b) is Lorne's to
   build end-to-end — he knows the ingestion path since he develops TL Opps. The
   one thing to settle *with Tess* is which style fields matter and how they map
   to TL Opps's own fields.
2. **Where should the Supabase `service_role` key rotation and the move to
   Supabase Pro (for backups) sit on the priority list?** Both are on the
   outstanding list in `/setup` inside the app.

*(Resolved: sketch editor uses OpenAI's GPT Image model — §8b. TL Opps is The
Loyalist's internal production/brands tool that Lorne develops; SSYNC pushes
style info out to it, and Lorne owns both ends of that push — §7b. AI summaries
live on the style profile only for now — §8a.)*

---

*Keep this file current as you build. If you change how deploys, secrets, or the
database work, update the matching section here and in `CLAUDE.md`.*
