-- ============================================================================
-- SSYNC — full base schema, for standing up a NEW deployment (e.g. FRED)
--
-- Generated 2026-08-17 by introspecting the live SSYNC/Loyalist database
-- (Supabase project axwavdjhzvtluvsixfjq), STRUCTURE ONLY — no rows, no data.
--
-- WHY THIS FILE EXISTS. The base tables were originally created by hand in the
-- Supabase dashboard and were never captured as migrations — only the later
-- additions (brands, linesheets) live in db/p*.sql. This is that missing base
-- schema, written out in full so a clone — FRED today, any future one later — is
-- ONE script instead of a manual pg_dump. The db/p*.sql files remain the running
-- history of changes; this is the whole picture as of the date above and already
-- includes everything they added.
--
-- HOW TO USE. Run this once, top to bottom, in a NEW, EMPTY Supabase project's
-- SQL editor. It creates every table, foreign key, index, the row-level-security
-- policies (already in the SECURE, authenticated-only state — the post-p0-rls
-- shape, so a clone is never briefly wide open), and the one storage bucket the
-- app uses, with its policies.
--
-- WHAT IT DOES NOT DO — the per-company setup, because it differs per parent
-- company. After running this, do the steps in the commented block at the very
-- bottom: insert at least one brand row, enable Google auth, add the allowlist.
-- Without a brand row the app falls back to the code's seed brands (SOUS SOUS /
-- RENGGLI) — so a FRED deployment MUST insert its own brand or it will show the
-- Loyalist's.
-- ============================================================================

create extension if not exists pgcrypto;

-- --- Tables -----------------------------------------------------------------
-- Foreign keys are added after all tables exist (below), so creation order here
-- does not matter and the self-referential style_comments.parent_id is fine.

create table public.brands (
  slug        text primary key,
  name        text not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  logo_url    text,
  palette     jsonb
);

create table public.app_allowlist (
  email       text primary key,
  note        text,
  added_by    text,
  created_at  timestamptz default now(),
  role        text,
  brand       text
);

create table public.settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

-- "references" is a reserved word — it must stay double-quoted everywhere.
create table public."references" (
  id              uuid primary key default gen_random_uuid(),
  image           text,
  thumb           text,
  designer        text not null,
  year            text,
  season          text,
  category        text,
  garment         text,
  fabric          text,
  color           text,
  color_hex       text,
  link            text,
  notes           text,
  created_by      text,
  created_at      timestamptz default now(),
  image_url       text,
  thumb_url       text,
  deleted_at      timestamptz,
  price           text,
  type            text default 'reference'::text,
  photographer    text,
  photographer_ig text,
  model           text,
  location        text,
  extra_images    jsonb default '[]'::jsonb,
  brand           text default 'sous-sous'::text
);

create table public.styles (
  id                uuid primary key default gen_random_uuid(),
  style_no          text,
  name              text not null,
  category          text,
  garment           text,
  designer          text,
  brand             text default 'sous-sous'::text,
  status            text not null default 'inspo'::text,
  stage             text,
  evergreen         boolean not null default false,
  season            text,
  factory           text,
  cover_image       text,
  tech_pack_url     text,
  notes             text,
  created_by        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  fit_notes         text,
  photos            jsonb not null default '{}'::jsonb,
  fabric            text,
  colors            text,
  deleted_at        timestamptz,
  wip_url           text,
  library_at        timestamptz,
  blank_style       text,
  fabric_type       text,
  hs_code           text,
  country_of_origin text,
  weight_lbs        numeric,
  material          text
);

create table public.style_versions (
  id               uuid primary key default gen_random_uuid(),
  style_id         uuid,
  version_no       integer not null default 1,
  changes          text,
  season           text,
  image            text,
  is_ai_generated  boolean default false,
  notes            text,
  created_by       text,
  created_at       timestamptz default now(),
  spawned_style_id uuid,
  deleted_at       timestamptz
);

create table public.style_samples (
  id                     uuid primary key default gen_random_uuid(),
  style_id               uuid,
  round                  text not null,
  factory                text,
  submitted_date         date,
  received_date          date,
  status                 text,
  comments               text,
  created_at             timestamptz default now(),
  fit_notes              text,
  material_supplier      text,
  material_ordered_date  date,
  material_eta_date      date,
  material_received_date date,
  material_type          text,
  material_contents      text,
  material_notes         text,
  eta_date               date,
  photos                 jsonb not null default '{}'::jsonb,
  location               text,
  contact_name           text,
  contact_email          text,
  rating                 text,
  tracking_number        text,
  fitting_date           date,
  notes_sent_date        date
);

create table public.style_comments (
  id          uuid primary key default gen_random_uuid(),
  style_id    uuid,
  version_id  uuid,
  author      text,
  body        text not null,
  status      text default 'open'::text,
  created_at  timestamptz default now(),
  parent_id   uuid,
  sample_id   uuid,
  deleted_at  timestamptz
);

create table public.style_references (
  style_id     uuid not null,
  reference_id uuid not null,
  created_at   timestamptz default now(),
  primary key (style_id, reference_id)
);

create table public.moodboards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  items       jsonb not null default '[]'::jsonb,
  created_by  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  pages       integer default 1,
  archived    boolean not null default false,
  brand       text default 'sous-sous'::text
);

create table public.linesheets (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null default 'sous-sous'::text,
  name        text not null,
  kind        text not null default 'seasonal'::text,
  season      text,
  items       jsonb not null default '[]'::jsonb,
  notes       jsonb not null default '[]'::jsonb,
  archived    boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  subtitle    text
);

-- Note on the `brand` column defaults ('sous-sous'): harmless in a clone. Every
-- server action sets brand = activeBrand() explicitly on insert, so the column
-- default never actually applies; it is kept only to mirror the source exactly.

-- --- Foreign keys -----------------------------------------------------------

alter table public.style_versions
  add constraint style_versions_style_id_fkey
    foreign key (style_id) references public.styles(id) on delete cascade,
  add constraint style_versions_spawned_style_id_fkey
    foreign key (spawned_style_id) references public.styles(id) on delete set null;

alter table public.style_samples
  add constraint style_samples_style_id_fkey
    foreign key (style_id) references public.styles(id) on delete cascade;

alter table public.style_comments
  add constraint style_comments_style_id_fkey
    foreign key (style_id) references public.styles(id) on delete cascade,
  add constraint style_comments_version_id_fkey
    foreign key (version_id) references public.style_versions(id) on delete set null,
  add constraint style_comments_sample_id_fkey
    foreign key (sample_id) references public.style_samples(id) on delete set null,
  add constraint style_comments_parent_id_fkey
    foreign key (parent_id) references public.style_comments(id) on delete set null;

alter table public.style_references
  add constraint style_references_style_id_fkey
    foreign key (style_id) references public.styles(id) on delete cascade,
  add constraint style_references_reference_id_fkey
    foreign key (reference_id) references public."references"(id) on delete cascade;

-- --- Indexes (the primary keys already created their unique indexes) ---------

create index references_brand_idx    on public."references" using btree (brand);
create index references_category_idx on public."references" using btree (category);
create index references_color_idx    on public."references" using btree (color);
create index references_deleted_idx  on public."references" using btree (deleted_at);
create index references_designer_idx on public."references" using btree (designer);
create index references_fabric_idx   on public."references" using btree (fabric);
create index references_garment_idx  on public."references" using btree (garment);
create index references_season_idx   on public."references" using btree (season);
create index references_year_idx     on public."references" using btree (year);

create index moodboards_brand_idx on public.moodboards using btree (brand);
create index linesheets_brand_idx on public.linesheets using btree (brand);

create index style_comments_live_idx
  on public.style_comments using btree (style_id, created_at) where (deleted_at is null);
create index style_comments_parent_idx    on public.style_comments using btree (parent_id);
create index style_comments_sample_id_idx on public.style_comments using btree (sample_id);

create index style_versions_deleted_at_idx       on public.style_versions using btree (deleted_at);
create index style_versions_spawned_style_id_idx on public.style_versions using btree (spawned_style_id);

create index styles_brand_idx      on public.styles using btree (brand);
create index styles_deleted_at_idx on public.styles using btree (deleted_at);

-- --- Row-level security ------------------------------------------------------
-- The SECURE state: reads and writes are authenticated-only (the post-p0-rls
-- shape), except brands, which is world-readable so a share/login page can name
-- a brand before sign-in. Nothing is granted to anon on any app table, so a
-- fresh clone is never briefly wide open.

alter table public.app_allowlist    enable row level security;
alter table public.brands           enable row level security;
alter table public.linesheets       enable row level security;
alter table public.moodboards       enable row level security;
alter table public."references"     enable row level security;
alter table public.settings         enable row level security;
alter table public.style_comments   enable row level security;
alter table public.style_references enable row level security;
alter table public.style_samples    enable row level security;
alter table public.style_versions   enable row level security;
alter table public.styles           enable row level security;

create policy "signed-in can read app_allowlist"  on public.app_allowlist for select to authenticated using (true);
create policy "signed-in can write app_allowlist" on public.app_allowlist for all    to authenticated using (true) with check (true);

create policy "anyone can read brands"     on public.brands for select to public        using (true);
create policy "signed-in can write brands" on public.brands for all    to authenticated using (true) with check (true);

create policy "signed-in can read linesheets"  on public.linesheets for select to authenticated using (true);
create policy "signed-in can write linesheets" on public.linesheets for all    to authenticated using (true) with check (true);

create policy "signed-in can read moodboards"  on public.moodboards for select to authenticated using (true);
create policy "signed-in can write moodboards" on public.moodboards for all    to authenticated using (true) with check (true);

create policy "signed-in can read references"  on public."references" for select to authenticated using (true);
create policy "signed-in can write references" on public."references" for all    to authenticated using (true) with check (true);

create policy "signed-in can read settings"  on public.settings for select to authenticated using (true);
create policy "signed-in can write settings" on public.settings for all    to authenticated using (true) with check (true);

create policy "signed-in can read style_comments"  on public.style_comments for select to authenticated using (true);
create policy "signed-in can write style_comments" on public.style_comments for all    to authenticated using (true) with check (true);

create policy "signed-in can read style_references"  on public.style_references for select to authenticated using (true);
create policy "signed-in can write style_references" on public.style_references for all    to authenticated using (true) with check (true);

create policy "signed-in can read style_samples"  on public.style_samples for select to authenticated using (true);
create policy "signed-in can write style_samples" on public.style_samples for all    to authenticated using (true) with check (true);

create policy "signed-in can read style_versions"  on public.style_versions for select to authenticated using (true);
create policy "signed-in can write style_versions" on public.style_versions for all    to authenticated using (true) with check (true);

create policy "signed-in can read styles"  on public.styles for select to authenticated using (true);
create policy "signed-in can write styles" on public.styles for all    to authenticated using (true) with check (true);

-- --- API role grants --------------------------------------------------------
-- The dashboard adds these automatically when you make a table in the UI, but a
-- raw `create table` in the SQL editor does NOT — without them the anon and
-- authenticated API roles get "permission denied for table ..." on the first
-- write, even though RLS is set up. RLS (above) still gates every row; these
-- just let the API roles reach the tables at all. (Learned the hard way on the
-- FRED clone, 2026-08-17.)

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables    in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant all privileges on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- --- Storage ----------------------------------------------------------------
-- One public bucket, "references" — every image the app uploads (references,
-- style photos, moodboard images) lives here under different path prefixes. It
-- is public so image URLs and share links render for signed-out viewers; writes
-- are authenticated-only, scoped to this bucket.

insert into storage.buckets (id, name, public)
  values ('references', 'references', true)
  on conflict (id) do nothing;

create policy "refs storage read"   on storage.objects for select to authenticated using (bucket_id = 'references');
create policy "refs storage insert" on storage.objects for insert to authenticated with check (bucket_id = 'references');
create policy "refs storage update" on storage.objects for update to authenticated using (bucket_id = 'references') with check (bucket_id = 'references');
create policy "refs storage delete" on storage.objects for delete to authenticated using (bucket_id = 'references');

-- ============================================================================
-- PER-COMPANY SETUP — do this after the script runs. Uncomment and edit.
-- ============================================================================
--
-- 1) At least ONE brand row. REQUIRED: with an empty brands table the app falls
--    back to the code's seed brands (SOUS SOUS / RENGGLI), so a FRED deployment
--    would show the Loyalist's brands. Replace with FRED's real brand(s):
--
--    insert into public.brands (slug, name) values ('fred', 'FRED');
--
-- 2) Google sign-in: Supabase dashboard → Authentication → Providers → Google,
--    with FRED's own OAuth client. Then set FRED's real Google Workspace domain
--    in lib/appConfig.ts (the fred preset's orgDomain) so that domain is
--    auto-approved.
--
-- 3) Anyone signing in from outside that domain needs an allowlist row:
--
--    insert into public.app_allowlist (email, role, brand)
--      values ('someone@example.com', 'team', 'fred');
--
-- Data (references, styles, settings/vocabulary) starts empty — that is FRED's
-- own, built in the app. Nothing from the Loyalist is copied.
-- ============================================================================
