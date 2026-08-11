-- Multi-brand phase 3: brand-scoped row-level security.
--
-- Tess, 2026-08-11: "make this usable for other brands … certain brand specific
-- talents would only have access to a limited view of their brand."
--
-- ⚠️  PREPARED, NOT YET APPLIED. This is the database half of the talent gate.
-- It layers ON TOP OF db/p0-rls.sql (applied 2026-08-11), which closed every
-- policy from {public} to {authenticated}. Run this only when you are about to
-- onboard the first real OUTSIDE talent — until then it changes nothing, because
-- everyone currently signed in is @theloyalist.com, which resolves to team and
-- keeps full access to every brand under the rules below.
--
-- THE CORRECTION (2026-08-11): the first draft added brand-scoped policies but
-- left p0's open "signed-in can read/write …" policies in place. Postgres
-- OR-combines permissive policies, so the open one would have won and the
-- scoping would never have bitten. This version DROPS each p0 policy on the
-- tables it re-governs before creating its own. Verified by impersonating a
-- talent in a rolled-back transaction: a renggli talent saw only renggli rows,
-- zero product rows; a @theloyalist.com user saw everything.
--
-- STILL DEFERRED: storage. p0 grants authenticated the references bucket's API,
-- not scoped by brand. The bucket is also public (images served by URL), so
-- brand-confidentiality of images is not achievable there regardless; hardening
-- it is a separate pass to do WITH the first talent onboarding, noted at the end.
-- ---------------------------------------------------------------------------

begin;

-- Who the request is, from the Google session on the JWT.
create or replace function public.auth_email() returns text
  language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

-- Team = the org's own domain, OR an allowlist row that is not a talent. Talent
-- is the only narrowed role, so everything else the allowlist admits is team.
-- security definer so it can read app_allowlist regardless of the caller's own
-- row-level access to it.
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

-- 1. Ideation tables (references, moodboards): team sees everything; a talent
--    reads and writes only rows in their own brand. Drop p0's open pair first,
--    or it OR-combines and defeats the scope.
do $$
declare t text;
begin
  foreach t in array array['references','moodboards'] loop
    execute format('drop policy if exists "signed-in can read %1$I"  on public.%1$I', t);
    execute format('drop policy if exists "signed-in can write %1$I" on public.%1$I', t);
    execute format('drop policy if exists "brand read %1$I"  on public.%1$I', t);
    execute format('drop policy if exists "brand write %1$I" on public.%1$I', t);
    execute format($f$create policy "brand read %1$I" on public.%1$I
        for select to authenticated
        using (public.is_team() or brand = public.my_brand())$f$, t);
    execute format($f$create policy "brand write %1$I" on public.%1$I
        for all to authenticated
        using (public.is_team() or brand = public.my_brand())
        with check (public.is_team() or brand = public.my_brand())$f$, t);
  end loop;
end $$;

-- 2. Product tables and settings: team only. A talent has no product side, so no
--    brand test is needed — is_team() alone. (style_samples/versions/comments/
--    references hang off a style, which only team can reach.)
do $$
declare t text;
begin
  foreach t in array array[
    'styles','style_samples','style_versions','style_comments','style_references','settings'
  ] loop
    execute format('drop policy if exists "signed-in can read %1$I"  on public.%1$I', t);
    execute format('drop policy if exists "signed-in can write %1$I" on public.%1$I', t);
    execute format('drop policy if exists "team only %1$I" on public.%1$I', t);
    execute format($f$create policy "team only %1$I" on public.%1$I
        for all to authenticated
        using (public.is_team()) with check (public.is_team())$f$, t);
  end loop;
end $$;

-- 3. app_allowlist: readable by any signed-in user (the login path reads its own
--    row as the just-signed-in user, so the read must succeed), writable by team
--    only (that is who manages talents on /setup).
drop policy if exists "signed-in can read app_allowlist"  on public.app_allowlist;
drop policy if exists "signed-in can write app_allowlist" on public.app_allowlist;
drop policy if exists "read allowlist" on public.app_allowlist;
drop policy if exists "team writes allowlist" on public.app_allowlist;
create policy "read allowlist" on public.app_allowlist
  for select to authenticated using (true);
create policy "team writes allowlist" on public.app_allowlist
  for all to authenticated using (public.is_team()) with check (public.is_team());

commit;

--------------------------------------------------------------------------------
-- STORAGE — the pass to do WITH the first talent onboarding, not before.
--
-- p0 left storage.objects on the references bucket open to any authenticated
-- user for read/insert/update/delete. For a talent that means they could reach
-- another brand's image objects by API. The bucket is public, so this is not a
-- confidentiality regression for reads (the URLs are already public); the part
-- worth closing is cross-brand insert/update/delete. Doing it well needs the
-- object paths to carry the brand so a policy can key on it. Left as its own
-- step so it is a deliberate change, not a rider on this one.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- ROLLBACK — restores the p0 state (every table open to any signed-in user).
-- Safe at any time; touches no rows. Uncomment and run.
--------------------------------------------------------------------------------
/*
begin;

do $$
declare t text;
begin
  foreach t in array array[
    'references','moodboards','styles','style_samples','style_versions',
    'style_comments','style_references','settings','app_allowlist'
  ] loop
    execute format('drop policy if exists "brand read %1$I"   on public.%1$I', t);
    execute format('drop policy if exists "brand write %1$I"  on public.%1$I', t);
    execute format('drop policy if exists "team only %1$I"    on public.%1$I', t);
    execute format('drop policy if exists "read allowlist"    on public.%1$I', t);
    execute format('drop policy if exists "team writes allowlist" on public.%1$I', t);
    execute format($f$create policy "signed-in can read %1$I"  on public.%1$I
        for select to authenticated using (true)$f$, t);
    execute format($f$create policy "signed-in can write %1$I" on public.%1$I
        for all to authenticated using (true) with check (true)$f$, t);
  end loop;
end $$;

commit;
*/
