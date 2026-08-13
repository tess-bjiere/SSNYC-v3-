# How to: Edit SSYNC

**For Lorne.** You know the stack and you're already in the repos, so this is the
short version — the SSYNC-specific things that'll bite, then the two features to
build: the **TL Opps + sheets sync** and the **AI** (Claude summaries, ChatGPT
sketch edits).

Repo `tess-bjiere/SSNYC-v3-`, deploys from `main`. Live at
`https://ssync-two.vercel.app`. Deeper notes for the AI coding assistant live in
`CLAUDE.md`.

---

## 1. Before you touch it

A few things that aren't obvious and will bite. Everything else is standard
Next.js / Supabase / Vercel.

- **The Supabase project (`axwavdjhzvtluvsixfjq`) is production** — treat every
  write as real. There's no staging, but Supabase runs **daily backups**, so a
  bad `delete from` / `drop column` costs at most a day, not everything.
- **Nothing hard-deletes.** Everything has a `deleted_at` — "delete" sets a
  timestamp, "restore" clears it. Never `delete from` / `drop column`.
- **`db/p0-rls.sql` closes the row-level-security policies** — never run it
  unless Tess asks, that specific time. Run wrong it makes every page render
  empty and looks exactly like a broken deploy.
- **`styles.photos` / `style_samples.photos` are shared jsonb maps.**
  Read-modify-write them through `lib/imageList.ts`; never rebuild the map — a
  full overwrite deletes a photoshoot. (Matters for the sketch-edit feature.)
- **Secrets go in Vercel env vars** — server-only, no `NEXT_PUBLIC_` prefix —
  never in code.
- **Repo shape:** DB writes go through server actions (`app/actions/*`); logic
  lives in pure, tested `lib/*`; SQL migrations are applied by hand in the
  Supabase SQL editor (additive + nullable only).

---

## 2. TL Opps + techpacks / WIP

Two directions. Reading the studio's Google Sheets *into* SSYNC already exists;
pushing *out* to TL Opps is yours to build.

### Read techpacks + WIPs — mostly done

The WIP reader is built and tested, just switched off pending Google creds:
`lib/wipSources.ts` (the per-brand allowlist + column map), `lib/wipImport.ts`,
`lib/googleDrive.ts`, `app/actions/wip.ts`.

**Turn it on:**

- Under a **theloyalist.com** Workspace login — so The Loyalist owns it, not a
  personal Gmail — create a Google Cloud project and a **service account**, and
  download its JSON key. The account's own address is a robot
  (`…@<project>.iam.gserviceaccount.com`) — that's expected, not a person's email.
- Share the studio's WIP / techpack Drive folders **with that robot address**,
  read-only. No domain-wide delegation — just the folders it needs.
- Put the email + private key in Vercel as `GOOGLE_SA_EMAIL` /
  `GOOGLE_SA_PRIVATE_KEY`, then un-comment the "Pull from WIP" panel on the style
  profile.

**Add a sheet** (a techpack sheet, another brand's WIP): one new entry in
`lib/wipSources.ts` — brand, Drive file, column map. Nothing else changes. It's
**read-only and brand-scoped** — a brand can only ever read its own sheet.

### Push style info to TL Opps — yours

You develop TL Opps, so you own both ends. Build it like every other write here:
a pure `lib/tlOpps.ts` (the payload from a style) + a server action
`app/actions/tlOpps.ts` that POSTs to your TL Opps endpoint (token in Vercel).

- **Key on style number** — upsert, don't append (re-pushing a style updates its
  record).
- **Brand-scoped**, and fired from an explicit **"Push to TL Opps"** button, not
  a hidden timer.
- The one thing to settle with Tess: **which fields TL Opps wants.**

**Do we write back to the sheets?** Probably not — **TL Opps is the push target,
not the Google Sheets.** If a sheet ever does need writing, that's the Google
Sheets API (write), not the read-only Drive reader above. Confirm with Tess if it
comes up.

---

## 3. AI: summaries + sketch edits

**Architecture (same for both):** all AI calls run **server-side; the API key
never reaches the browser.** A pure `lib/` module builds the request, a route
handler (`app/api/…/route.ts`) makes the call with a server-only key, the client
just calls the route. Copy the shape from the existing `app/api/img/route.ts`.

### Summaries — Claude, on the style profile

`npm i @anthropic-ai/sdk`, add `ANTHROPIC_API_KEY` to Vercel. Build the prompt in
`lib/aiSummary.ts` (testable), call it in `app/api/summarize/route.ts`. Start
with `claude-sonnet-5` (or `claude-haiku-4-5` for short/cheap); Opus only if you
need it.

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();            // reads ANTHROPIC_API_KEY

const msg = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: buildSummaryPrompt(style) }],
});
const text = msg.content.find((b) => b.type === "text")?.text ?? "";
```

### Sketch edits — ChatGPT / GPT Image

`npm i openai`, add `OPENAI_API_KEY` to Vercel. Use `gpt-image-1`'s image-edit
endpoint (existing sketch + instruction → edited image).

```ts
import OpenAI, { toFile } from "openai";
const client = new OpenAI();               // reads OPENAI_API_KEY

const result = await client.images.edit({
  model: "gpt-image-1",
  image: await toFile(sketchBuffer, "sketch.png", { type: "image/png" }),
  prompt: instruction,                     // "make the sleeves longer"
});
const b64 = result.data[0].b64_json;       // → upload to Supabase storage
```

**Storing the edit:** the edited image becomes part of `styles.photos`. Attach it
through `lib/imageList.ts` as a **new** image (a colorway/gallery entry) — **never
overwrite the whole map** (gotcha #4 above). Keep the original sketch; the edit is
a new image.
