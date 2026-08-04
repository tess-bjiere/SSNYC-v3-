# SSYNC — v2 (Next.js)

The rebuilt SOUS SOUS reference library + **style development tool**, on Next.js + Supabase, ready to deploy to Vercel. This is the **foundation slice**: Google login (with a flexible allowlist), the Library reading your existing data, Style Profiles, and the Inspo / Development / Production workflow.

## Your data is safe and already connected

This app points at your **existing** Supabase project (`axwavdjhzvtluvsixfjq`) — the same database the current tool uses. Nothing was moved or copied. The development-tool tables (`styles`, `style_versions`, `style_samples`, `style_comments`, `style_references`, `app_allowlist`) were **added** alongside your `references` (76 rows), `moodboards` (6), and `settings` (3); none of your existing tables or data were altered. The exact SQL is in `supabase/migrations/0001_dev_tool_foundation.sql` (already applied).

---

## 1. Run it locally (2 minutes)

```bash
npm install
npm run dev
```

Open http://localhost:3000. It starts in **preview mode** (`NEXT_PUBLIC_DEV_BYPASS_AUTH=true` in `.env.local`), which skips login so you can click around immediately. The **Library** page will show your real references; **Development** is where style profiles live (empty until you create some — use **+ New Style**).

> Note: preview mode is for local browsing only. Turn it off (step 2) before deploying.

---

## 2. Turn on real Google login + the allowlist

**a. Create a Google OAuth client** — Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → Web application. Under **Authorized redirect URIs** add your Supabase callback:

```
https://axwavdjhzvtluvsixfjq.supabase.co/auth/v1/callback
```

**b. Enable Google in Supabase** — Supabase dashboard → Authentication → Providers → **Google** → paste the Client ID and Client Secret → save.

**c. Set the app URLs** — Supabase → Authentication → URL Configuration:
- **Site URL:** your deployed URL (e.g. `https://ssync.vercel.app`)
- **Redirect URLs:** add both `http://localhost:3000/**` and `https://YOUR-VERCEL-DOMAIN/**`

**d. Enforce login** — set `NEXT_PUBLIC_DEV_BYPASS_AUTH=false` (locally in `.env.local`, and as an env var in Vercel).

### How access works
- Anyone signing in with an **@theloyalist.com** Google account is auto-approved.
- To add someone **outside** the domain (a contractor, partner), add their email to the allowlist:

```sql
insert into public.app_allowlist (email, note) values ('guest@example.com', 'Freelance designer');
```

They then sign in with their own Google account. Remove access by deleting the row. (A simple in-app admin screen for this is a fast follow.)

---

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel → **Add New Project** → import the repo (Next.js is auto-detected).
3. Add Environment Variables (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://axwavdjhzvtluvsixfjq.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = *(the anon key — it's in your `.env.local`)*
   - `NEXT_PUBLIC_DEV_BYPASS_AUTH` = `false`
4. Deploy. Then add the Vercel domain to Supabase redirect URLs (step 2c) and the Google client (step 2a).

Every `git push` redeploys automatically — that's the "easy to manage" part.

---

## What's built in this slice

- **Auth:** Google sign-in, `@theloyalist.com` auto-allow + guest allowlist, sign-out, "not authorized" screen, dev preview bypass.
- **Library:** reads your existing `references` (proves the data carried over).
- **Development workflow:** Inspo / Development / Production / Archived tabs with live counts.
- **Style Profile** (one per style): details, cover, tech-pack link, status control, **sample-cycle tracker** (proto → SMS → PPS → bulk with factory + dates), **versions**, and **comments** with the **"Received"** status from your brainstorm.
- **New Style** creation form.

## What's next (from the plan, later phases)

Moodboard port + "in development" tags, notifications (email), Google Doc export, by-factory view/filter, evergreen library + AI color/print/trim variations, tech-pack auto-population. See the integration plan doc.

## Project structure

```
app/
  (app)/              authenticated area (nav + gate)
    library/          reads existing references
    development/      Inspo/Dev/Production tabs
    styles/new/       create a style
    styles/[id]/      style profile (versions, samples, comments)
  auth/callback/      Google OAuth return + allowlist check
  login/  not-authorized/
lib/
  supabase/           browser + server + middleware clients
  access.ts           allowlist + session logic
  types.ts            shared row types
supabase/migrations/  the additive schema (already applied)
```
