-- Multi-brand god mode (Tess, 2026-08-11: "ability for admin / god mode to add
-- new brand into ssync ... it would be like renggli with no existing
-- references, styles, etc").
--
-- APPLIED 2026-08-11 via the Supabase MCP. Brands were a hardcoded list in
-- lib/brands.ts; this makes them data so a named super-admin can add one from
-- Setup. The `brand` text column on styles/references/moodboards is unchanged —
-- this is only the lookup the switcher and slug-validation read, seeded with the
-- two brands that already exist so nothing changes for them. Add + rename only,
-- no delete (a brand with data must not vanish).

create table if not exists public.brands (
  slug        text primary key,
  name        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

insert into public.brands (slug, name) values
  ('sous-sous', 'SOUS SOUS'),
  ('renggli',   'RENGGLI')
on conflict (slug) do nothing;

-- Read is public: the brand list is non-sensitive and already shipped in the
-- client bundle when it was a constant, so the switcher/validation can read it
-- even in the session-less preview. Writes are for signed-in users, and the app
-- narrows that to the named super-admins (checkSuperAdmin) — RLS cannot see that
-- list, so the god-mode gate lives in the server action (app/actions/brands.ts).
alter table public.brands enable row level security;
drop policy if exists "anyone can read brands" on public.brands;
drop policy if exists "signed-in can write brands" on public.brands;
create policy "anyone can read brands" on public.brands
  for select using (true);
create policy "signed-in can write brands" on public.brands
  for all to authenticated using (true) with check (true);
