--------------------------------------------------------------------------------
-- SSYNC v2 — P0 security: close the open database policies
--
-- READ THIS BEFORE RUNNING ANY OF IT. Nothing here has been applied. It is
-- written to be reviewed, run deliberately, and rolled back in one paste if it
-- goes wrong.
--
-- WHAT IS WRONG TODAY
--
-- Every table in `public` has two policies granted to the `public` role, both
-- with a `true` condition:
--
--     "team can read <table>"    SELECT   USING (true)
--     "team can write <table>"   ALL      USING (true) WITH CHECK (true)
--
-- The `public` role includes `anon`, and the anon key is shipped in the browser
-- bundle of every page — that is what it is for. Put those two facts together
-- and anyone who opens the site, or reads the share link you sent a factory,
-- holds a key that reads and writes the entire studio database: every
-- reference, every board, every style, every comment, and the allowlist that
-- decides who is allowed in. Not just reads. Writes and deletes too.
--
-- The application code is now correct — all 42 server actions call
-- `requireUser()` first. But the application is not the only way in. This is
-- the other way, and it is the one the app cannot fix from inside.
--
-- WHAT THIS DOES
--
-- Replaces every one of those policies with the same policy granted to
-- `authenticated` instead of `public`. Nothing about the shape of the rules
-- changes — the studio stays a single shared workspace where everyone signed
-- in can see and edit everything, which is how the studio actually works and
-- how the original tool behaved. The only change is that "everyone" stops
-- including "anyone".
--
-- THE ORDER MATTERS. Read this part twice.
--
--   1. Switch Google sign-in on in Supabase first.
--   2. Set SUPABASE_SERVICE_ROLE_KEY in Vercel (and in .env.local, if you run
--      the app locally). The two public pages — /r/[id] and /share/[id] — read
--      through it, scoped to the one id in the URL. Without it they fall back
--      to the anon key and will 404 the moment step 4 runs.
--   3. Set NEXT_PUBLIC_DEV_BYPASS_AUTH=false and sign in for real, everywhere
--      you use the app. Preview mode has no Supabase session, so after step 4
--      every page in preview mode renders empty. This is the step people skip.
--   4. Then run this file.
--
-- Running step 4 before steps 1-3 does not damage any data — nothing here
-- touches a row — but it will make the app look completely broken until they
-- are done.
--------------------------------------------------------------------------------


--------------------------------------------------------------------------------
-- 0. Before: what the policies look like now. Run this first and keep the
--    output. It is the receipt you check the rollback against.
--------------------------------------------------------------------------------

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;


--------------------------------------------------------------------------------
-- 1. The nine tables in `public`.
--
-- Each pair is dropped and recreated rather than altered, because `ALTER
-- POLICY` cannot change the role it applies to. The whole block is one
-- transaction: either every table is closed or none is, and there is no window
-- where a table has had its old policy dropped and not yet got its new one.
--------------------------------------------------------------------------------

begin;

-- references — the library itself. 87 rows, 85 live.
drop policy if exists "team can read references"  on public."references";
drop policy if exists "team can write references" on public."references";
create policy "signed-in can read references"  on public."references"
  for select to authenticated using (true);
create policy "signed-in can write references" on public."references"
  for all to authenticated using (true) with check (true);

-- moodboards
drop policy if exists "team can read moodboards"  on public.moodboards;
drop policy if exists "team can write moodboards" on public.moodboards;
create policy "signed-in can read moodboards"  on public.moodboards
  for select to authenticated using (true);
create policy "signed-in can write moodboards" on public.moodboards
  for all to authenticated using (true) with check (true);

-- styles
drop policy if exists "team can read styles"  on public.styles;
drop policy if exists "team can write styles" on public.styles;
create policy "signed-in can read styles"  on public.styles
  for select to authenticated using (true);
create policy "signed-in can write styles" on public.styles
  for all to authenticated using (true) with check (true);

-- style_references
drop policy if exists "team can read style_references"  on public.style_references;
drop policy if exists "team can write style_references" on public.style_references;
create policy "signed-in can read style_references"  on public.style_references
  for select to authenticated using (true);
create policy "signed-in can write style_references" on public.style_references
  for all to authenticated using (true) with check (true);

-- style_versions
drop policy if exists "team can read style_versions"  on public.style_versions;
drop policy if exists "team can write style_versions" on public.style_versions;
create policy "signed-in can read style_versions"  on public.style_versions
  for select to authenticated using (true);
create policy "signed-in can write style_versions" on public.style_versions
  for all to authenticated using (true) with check (true);

-- style_samples
drop policy if exists "team can read style_samples"  on public.style_samples;
drop policy if exists "team can write style_samples" on public.style_samples;
create policy "signed-in can read style_samples"  on public.style_samples
  for select to authenticated using (true);
create policy "signed-in can write style_samples" on public.style_samples
  for all to authenticated using (true) with check (true);

-- style_comments
drop policy if exists "team can read style_comments"  on public.style_comments;
drop policy if exists "team can write style_comments" on public.style_comments;
create policy "signed-in can read style_comments"  on public.style_comments
  for select to authenticated using (true);
create policy "signed-in can write style_comments" on public.style_comments
  for all to authenticated using (true) with check (true);

-- settings — the studio's saved lists (categories, garments, and so on).
drop policy if exists "team can read settings"  on public.settings;
drop policy if exists "team can write settings" on public.settings;
create policy "signed-in can read settings"  on public.settings
  for select to authenticated using (true);
create policy "signed-in can write settings" on public.settings
  for all to authenticated using (true) with check (true);

-- app_allowlist — the list of who is allowed in.
--
-- This one is the sharpest. Today anyone with the anon key can add a row to
-- it, which is to say anyone can grant themselves access to the app. Read stays
-- open to signed-in people because the allowlist check runs as the user who
-- just signed in; only that read has to succeed for a guest to get in at all.
drop policy if exists "team can read app_allowlist"  on public.app_allowlist;
drop policy if exists "team can write app_allowlist" on public.app_allowlist;
create policy "signed-in can read app_allowlist"  on public.app_allowlist
  for select to authenticated using (true);
create policy "signed-in can write app_allowlist" on public.app_allowlist
  for all to authenticated using (true) with check (true);

commit;


--------------------------------------------------------------------------------
-- 2. Storage.
--
-- The `references` bucket is marked public, so images are served over the
-- public object path and do not consult these policies at all. That is why the
-- share pages keep showing pictures after this runs, and it is a deliberate
-- choice rather than an oversight: a share link that renders no images is not a
-- share link. The trade is that anyone holding an image URL can open it.
--
-- Making the bucket private is a separate, larger decision — every image in the
-- app would have to move to signed URLs, including the ones inside share links.
-- Not part of P0. Worth revisiting once the studio is actually using the tool.
--
-- What these policies do gate is the authenticated API: listing the bucket,
-- uploading, overwriting, deleting. Those are the ones that should never have
-- been open to `anon`, and after this they are not.
--------------------------------------------------------------------------------

begin;

drop policy if exists "refs storage read"   on storage.objects;
drop policy if exists "refs storage insert" on storage.objects;
drop policy if exists "refs storage update" on storage.objects;
drop policy if exists "refs storage delete" on storage.objects;

create policy "refs storage read" on storage.objects
  for select to authenticated using (bucket_id = 'references');
create policy "refs storage insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'references');
create policy "refs storage update" on storage.objects
  for update to authenticated using (bucket_id = 'references') with check (bucket_id = 'references');
create policy "refs storage delete" on storage.objects
  for delete to authenticated using (bucket_id = 'references');

commit;


--------------------------------------------------------------------------------
-- 3. After: confirm. Every row should now read `{authenticated}`.
--------------------------------------------------------------------------------

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- And confirm nothing moved. These are the numbers as of 2026-08-04.
select
  (select count(*) from public."references")                         as refs,        -- 87
  (select count(*) from public."references" where deleted_at is null) as live_refs,  -- 85
  (select count(*) from public.moodboards)                            as boards,     -- 6
  (select count(*) from public.settings)                              as settings_keys, -- 3
  (select count(*) from public.styles)                                as styles,     -- 0
  (select count(*) from public.style_samples)                         as samples;    -- 0


--------------------------------------------------------------------------------
-- 4. THEN CHECK THE APP, in this order. Any failure → run the rollback below.
--
--   a. Signed in: open Library, Moodboard, Development. Images and rows appear.
--   b. Signed in: edit something small and reload. It saved.
--   c. Signed in: upload one image. It uploads and renders.
--   d. Signed OUT, in a private window: open a /share/<board-id> link. The
--      board renders with its images. (This is the service-role read path — if
--      it 404s, SUPABASE_SERVICE_ROLE_KEY is not set where the app can see it.)
--   e. Signed OUT: open an /r/<reference-id> link. Same.
--   f. Signed OUT: open the app itself. It should send you to the login page.
--------------------------------------------------------------------------------


--------------------------------------------------------------------------------
-- 5. ROLLBACK — puts every policy back exactly as it was found on 2026-08-04.
--    Keep this to hand while testing. It is safe to run at any time and does
--    not touch a single row of data.
--------------------------------------------------------------------------------

/*
begin;

drop policy if exists "signed-in can read references"  on public."references";
drop policy if exists "signed-in can write references" on public."references";
create policy "team can read references"  on public."references" for select using (true);
create policy "team can write references" on public."references" for all using (true) with check (true);

drop policy if exists "signed-in can read moodboards"  on public.moodboards;
drop policy if exists "signed-in can write moodboards" on public.moodboards;
create policy "team can read moodboards"  on public.moodboards for select using (true);
create policy "team can write moodboards" on public.moodboards for all using (true) with check (true);

drop policy if exists "signed-in can read styles"  on public.styles;
drop policy if exists "signed-in can write styles" on public.styles;
create policy "team can read styles"  on public.styles for select using (true);
create policy "team can write styles" on public.styles for all using (true) with check (true);

drop policy if exists "signed-in can read style_references"  on public.style_references;
drop policy if exists "signed-in can write style_references" on public.style_references;
create policy "team can read style_references"  on public.style_references for select using (true);
create policy "team can write style_references" on public.style_references for all using (true) with check (true);

drop policy if exists "signed-in can read style_versions"  on public.style_versions;
drop policy if exists "signed-in can write style_versions" on public.style_versions;
create policy "team can read style_versions"  on public.style_versions for select using (true);
create policy "team can write style_versions" on public.style_versions for all using (true) with check (true);

drop policy if exists "signed-in can read style_samples"  on public.style_samples;
drop policy if exists "signed-in can write style_samples" on public.style_samples;
create policy "team can read style_samples"  on public.style_samples for select using (true);
create policy "team can write style_samples" on public.style_samples for all using (true) with check (true);

drop policy if exists "signed-in can read style_comments"  on public.style_comments;
drop policy if exists "signed-in can write style_comments" on public.style_comments;
create policy "team can read style_comments"  on public.style_comments for select using (true);
create policy "team can write style_comments" on public.style_comments for all using (true) with check (true);

drop policy if exists "signed-in can read settings"  on public.settings;
drop policy if exists "signed-in can write settings" on public.settings;
create policy "team can read settings"  on public.settings for select using (true);
create policy "team can write settings" on public.settings for all using (true) with check (true);

drop policy if exists "signed-in can read app_allowlist"  on public.app_allowlist;
drop policy if exists "signed-in can write app_allowlist" on public.app_allowlist;
create policy "team can read app_allowlist"  on public.app_allowlist for select using (true);
create policy "team can write app_allowlist" on public.app_allowlist for all using (true) with check (true);

drop policy if exists "refs storage read"   on storage.objects;
drop policy if exists "refs storage insert" on storage.objects;
drop policy if exists "refs storage update" on storage.objects;
drop policy if exists "refs storage delete" on storage.objects;
create policy "refs storage read"   on storage.objects for select using (bucket_id = 'references');
create policy "refs storage insert" on storage.objects for insert with check (bucket_id = 'references');
create policy "refs storage update" on storage.objects for update using (bucket_id = 'references') with check (bucket_id = 'references');
create policy "refs storage delete" on storage.objects for delete using (bucket_id = 'references');

commit;
*/
