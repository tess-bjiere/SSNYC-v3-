-- Multi-brand phase 3: brand-scoped row-level security.
--
-- Tess, 2026-08-11: "make this usable for other brands … certain brand specific
-- talents would only have access to a limited view of their brand."
--
-- ⚠️  PREPARED, NOT APPLIED. This is the database-level half of the talent gate,
-- and it belongs with the deliberate RLS go-live — the same step as db/p0-rls.sql,
-- which the working notes say "must not be run without Tess saying so, in words,
-- that time." It is NOT run ad-hoc, for two concrete reasons:
--
--   1. The preview/dev-bypass environment has no real Supabase session, so the
--      moment policies stop being `using (true)` every page there renders empty.
--      It can only be verified once real Google sign-in is confirmed working for
--      everyone — which is exactly the ordering /setup warns about.
--   2. Today's policies are already RLS-on but wide open (`using (true)` for
--      public). p0-rls.sql is what first tightens them to authenticated; this
--      file layers brand-scoping on top of THAT, and must run after it.
--
-- Until this is applied, the talent gate is app-layer only: a talent's reads and
-- UI are locked to their brand, but a crafted request could still reach another
-- brand's ideation row by id. So do not give real outside talents access before
-- this runs. See lib/access.ts (requireTeam) for the app-layer half.
--
-- The plan below is the design to review and test during that go-live, not a
-- migration to paste blind.
-- ---------------------------------------------------------------------------

-- Who the request is, from the Google session on the JWT.
create or replace function public.auth_email() returns text
  language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

-- Team = the org's own domain, OR an allowlist row that is not a talent. Talent
-- is the only narrowed role, so everything else the allowlist admits is team.
create or replace function public.is_team() returns boolean
  language sql stable security definer set search_path = public as $$
  select
    public.auth_email() like '%@theloyalist.com'
    or exists (
      select 1 from public.app_allowlist a
      where lower(a.email) = public.auth_email()
        and coalesce(a.role,'team') <> 'talent'
    )
$$;

-- The one brand a talent is pinned to; null for team (who see every brand).
create or replace function public.my_brand() returns text
  language sql stable security definer set search_path = public as $$
  select a.brand from public.app_allowlist a
  where lower(a.email) = public.auth_email()
    and coalesce(a.role,'team') = 'talent'
  limit 1
$$;

-- The ideation tables: a talent may read and write, but only their brand.
--   using       — team sees all brands; a talent sees only rows whose brand is theirs.
--   with check  — a write can only land a row in the writer's own brand.
-- (Replace the open "team can …" policies from p0-rls.sql for these two tables.)
do $$
declare t text;
begin
  foreach t in array array['references','moodboards'] loop
    execute format('drop policy if exists "brand read %1$s" on public.%1$s', t);
    execute format('drop policy if exists "brand write %1$s" on public.%1$s', t);
    execute format($f$create policy "brand read %1$s" on public.%1$s
        for select to authenticated
        using (public.is_team() or brand = public.my_brand())$f$, t);
    execute format($f$create policy "brand write %1$s" on public.%1$s
        for all to authenticated
        using (public.is_team() or brand = public.my_brand())
        with check (public.is_team() or brand = public.my_brand())$f$, t);
  end loop;
end $$;

-- The product tables — styles and everything hanging off them — are team only.
-- A talent has no product side at all, so the policy needs no brand test: it is
-- simply is_team(). style_samples / style_versions / style_comments /
-- style_references gate the same way (they belong to a style, and only team
-- reach a style). settings likewise.
do $$
declare t text;
begin
  foreach t in array array[
    'styles','style_samples','style_versions','style_comments','style_references','settings'
  ] loop
    execute format('drop policy if exists "team only %1$s" on public.%1$s', t);
    execute format($f$create policy "team only %1$s" on public.%1$s
        for all to authenticated
        using (public.is_team()) with check (public.is_team())$f$, t);
  end loop;
end $$;

-- app_allowlist is the access model itself: readable so is_team()/my_brand() can
-- resolve, writable by team only (that is who manages talents on /setup).
drop policy if exists "read allowlist" on public.app_allowlist;
drop policy if exists "team writes allowlist" on public.app_allowlist;
create policy "read allowlist" on public.app_allowlist
  for select to authenticated using (true);
create policy "team writes allowlist" on public.app_allowlist
  for all to authenticated using (public.is_team()) with check (public.is_team());

-- Storage (the `references` bucket) still needs its own brand policy pass before
-- talents get in — a scoped read on storage.objects keyed to the path's brand.
-- Left for the go-live once the object paths carry the brand; flagged here so it
-- is not forgotten.
