-- People records and image tags — people phase 1 (Tess, 2026-11-02: "i need
-- recommendation on how to best organize the various image databases for
-- campaign, mood, photographer, model -- seems like there could be a better way
-- to organize?", and to the recommendation: "Yes, build phase 1").
--
-- ADDITIVE ONLY. Two new tables; nothing existing is altered, renamed or
-- removed. The `photographer` / `model` text on `references` stays and is still
-- what the team types — in this phase the tags are derived from it
-- (lib/peopleRecords.ts). The old name-keyed cards in `settings`
-- ("photographers", "models") are copied onto the records below and then simply
-- stop being read; the rows are left in place.
--
--   people            one row per photographer or model: name, where they are
--                     based, Instagram, site, and the card the team fills in
--                     (group, role, notes, star, image order …) as jsonb.
--   reference_people  which picture a person is on, and as what (photographer
--                     or model). A picture on any wall can be tagged — Campaign,
--                     Archival, the roster — which is what lets one image show on
--                     a profile without a copy.
--
-- Soft delete on both, like everything else here. The one hard delete is the
-- cascade from `references`: when Trash → "Delete forever" purges an image,
-- its tags go with it, since a tag to a picture that no longer exists means
-- nothing.
--
-- Section 3 fills both tables from what is there now, with the same rule the
-- app applies (a directory's own rows — roster, model — make a person; a credit
-- anywhere else only tags someone who exists). After the code is live, Setup →
-- Imports → "People records" runs that rule in the app and should find nothing
-- to change; if it does, pressing it settles the difference.
--
-- Brand-scoped RLS (db/p7-brand-rls.sql, not yet applied) will need policies for
-- both tables too — they carry `brand` for exactly that.
--
-- APPLIED 2026-11-02 via the Supabase MCP (Tess: "Yes, build phase 1").

-- 1. Tables ------------------------------------------------------------------

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  kind text not null check (kind in ('photographer', 'model')),
  name text not null,
  city text,
  ig text,
  link text,
  card jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One live person per name, per kind, per brand — what makes a rename to an
-- existing name a merge rather than a second card.
create unique index if not exists people_one_live_name
  on public.people (brand, kind, lower(btrim(name))) where deleted_at is null;
create index if not exists people_brand_kind on public.people (brand, kind);

create table if not exists public.reference_people (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  reference_id uuid not null references public."references"(id) on delete cascade,
  person_id uuid not null references public.people(id),
  role text not null check (role in ('photographer', 'model')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists reference_people_one_live_tag
  on public.reference_people (reference_id, person_id, role) where deleted_at is null;
create index if not exists reference_people_person on public.reference_people (person_id) where deleted_at is null;
create index if not exists reference_people_brand_role on public.reference_people (brand, role) where deleted_at is null;

-- 2. Access — the same signed-in policies db/p0-rls.sql gives `references` -----

alter table public.people enable row level security;
drop policy if exists "signed-in can read people"  on public.people;
drop policy if exists "signed-in can write people" on public.people;
create policy "signed-in can read people"  on public.people
  for select to authenticated using (true);
create policy "signed-in can write people" on public.people
  for all to authenticated using (true) with check (true);

alter table public.reference_people enable row level security;
drop policy if exists "signed-in can read reference_people"  on public.reference_people;
drop policy if exists "signed-in can write reference_people" on public.reference_people;
create policy "signed-in can read reference_people"  on public.reference_people
  for select to authenticated using (true);
create policy "signed-in can write reference_people" on public.reference_people
  for all to authenticated using (true) with check (true);

grant all on public.people to authenticated, service_role;
grant all on public.reference_people to authenticated, service_role;

-- 3. Backfill — idempotent: re-running adds only what is missing ----------------

-- 3a. A person for every name on a live directory row. City is the most common
-- one on their rows; Instagram and site the first given; the card is the one
-- the team filled in under their name in settings.
with own as (
  select r.id, r.brand, 'photographer'::text as kind, btrim(r.photographer) as name, r.location,
         nullif(btrim(r.photographer_ig), '') as ig,
         case when r.link ~* '(^@|instagram\.com/)' then null else nullif(btrim(r.link), '') end as site
    from public."references" r
   where r.deleted_at is null and r.type = 'roster'
     and lower(btrim(coalesce(r.photographer, ''))) not in ('', 'unknown', 'n/a', 'na', 'none', '-', '?')
  union all
  select r.id, r.brand, 'model', btrim(r.model), r.location,
         case when r.link ~* '(^@|instagram\.com/)' then nullif(btrim(r.link), '') end,
         case when r.link ~* '(^@|instagram\.com/)' then null else nullif(btrim(r.link), '') end
    from public."references" r
   where r.deleted_at is null and r.type = 'model'
     and lower(btrim(coalesce(r.model, ''))) not in ('', 'unknown', 'n/a', 'na', 'none', '-', '?')
),
keyed as (select *, lower(name) as k from own),
names as (
  select distinct on (brand, kind, k) brand, kind, k, name
    from keyed order by brand, kind, k, id
),
cities as (
  select distinct on (brand, kind, k) brand, kind, k, city
    from (select brand, kind, k, btrim(location) as city, count(*) as n, min(id::text) as first
            from keyed where nullif(btrim(location), '') is not null
           group by brand, kind, k, lower(btrim(location)), btrim(location)) c
   order by brand, kind, k, n desc, first
),
igs as (
  select distinct on (brand, kind, k) brand, kind, k, ig from keyed where ig is not null order by brand, kind, k, id
),
sites as (
  select distinct on (brand, kind, k) brand, kind, k, site from keyed where site is not null order by brand, kind, k, id
),
cards as (
  select s.key as setting, lower(btrim(e.key)) as k, e.value as card
    from public.settings s, jsonb_each(case when jsonb_typeof(s.value) = 'object' then s.value else '{}'::jsonb end) e
   where s.key in ('photographers', 'models')
)
insert into public.people (brand, kind, name, city, ig, link, card, created_by)
select n.brand, n.kind, n.name, c.city, i.ig, st.site,
       coalesce(cd.card, '{}'::jsonb), 'p30 backfill'
  from names n
  left join cities c using (brand, kind, k)
  left join igs i using (brand, kind, k)
  left join sites st using (brand, kind, k)
  left join cards cd on cd.k = n.k and cd.setting = case n.kind when 'photographer' then 'photographers' else 'models' end
 where not exists (
   select 1 from public.people p
    where p.brand = n.brand and p.kind = n.kind and lower(btrim(p.name)) = n.k and p.deleted_at is null
 );

-- 3b. Tag every live picture with the people its credit names. A directory's
-- own row is read whole; any other credit also by its parts ("Ana, Bea").
with credits as (
  select r.id, r.brand, 'photographer'::text as role, r.type = 'roster' as own, r.photographer as credit
    from public."references" r where r.deleted_at is null and r.photographer is not null
  union all
  select r.id, r.brand, 'model', r.type = 'model', r.model
    from public."references" r where r.deleted_at is null and r.model is not null
),
named as (
  select id, brand, role, lower(btrim(credit)) as k from credits
  union
  select c.id, c.brand, c.role, lower(btrim(part))
    from credits c, regexp_split_to_table(c.credit, '\s*[,;/]\s*') part
   where not c.own
)
insert into public.reference_people (brand, reference_id, person_id, role)
select distinct n.brand, n.id, p.id, n.role
  from named n
  join public.people p
    on p.brand = n.brand and p.kind = n.role and lower(btrim(p.name)) = n.k and p.deleted_at is null
 where not exists (
   select 1 from public.reference_people t
    where t.reference_id = n.id and t.person_id = p.id and t.role = n.role and t.deleted_at is null
 );
