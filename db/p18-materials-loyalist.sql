-- Tess, 2026-08-19: "for renggli / sous sous — materials may be provided
-- directly from the factory — so you may not have to order separately … but we
-- do want option to document materials because many will be evergreen."
--
-- The materials LIBRARY is now available on every deploy (only ORDERING stays
-- FRED-only). FRED's database already has this table — it was built up there,
-- via MCP, across db/p11 + p13 + p14 + p15 + p16. This one script is the whole
-- thing in one go, to CREATE it on the Loyalist project (axwavdjhzvtluvsixfjq),
-- which never had it. Run this by hand in that project's SQL editor. Until then,
-- /materials on SOUS SOUS and Renggli shows its empty state (the reader tolerates
-- the missing table), so nothing breaks before you run it.
--
-- Additive and idempotent: a plain CREATE TABLE IF NOT EXISTS with every column,
-- plus ADD COLUMN IF NOT EXISTS guards so re-running (or running after a partial
-- p11) is safe.

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'sous-sous',
  kind text not null default 'fabric',          -- 'fabric' | 'trim' | 'packaging'
  name text not null,
  supplier text,
  supplier_ref text,
  composition text,
  color text,
  color_hex text,
  weight text,            -- fabric: GSM / oz
  width text,             -- fabric: cm / in
  construction text,      -- fabric: woven / knit / …
  finish text,            -- fabric: washed / brushed / …
  trim_type text,         -- trim: button / zip / label / …
  size text,              -- trim / packaging: dimensions
  material text,          -- trim / packaging: brass / horn / LDPE / …
  pack_type text,         -- packaging: poly bag / box / hangtag / …
  hs_code text,           -- packaging: customs / HS classification code
  price text,
  moq text,
  lead_time text,
  notes text,
  sourcing text,          -- 'stock' | 'custom'
  archived boolean not null default false,
  current_production boolean not null default false,
  garments jsonb not null default '[]'::jsonb,   -- product names this material is used for
  image_url text,
  thumb_url text,
  extra_images jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Column guards, in case the table already exists from an earlier partial run.
alter table public.materials add column if not exists pack_type text;
alter table public.materials add column if not exists hs_code text;
alter table public.materials add column if not exists sourcing text;
alter table public.materials add column if not exists archived boolean not null default false;
alter table public.materials add column if not exists current_production boolean not null default false;
alter table public.materials add column if not exists garments jsonb not null default '[]'::jsonb;

alter table public.materials enable row level security;
drop policy if exists materials_read on public.materials;
drop policy if exists materials_insert on public.materials;
drop policy if exists materials_update on public.materials;
create policy materials_read on public.materials for select to authenticated using (true);
create policy materials_insert on public.materials for insert to authenticated with check (true);
create policy materials_update on public.materials for update to authenticated using (true);

grant all on public.materials to anon, authenticated, service_role;
create index if not exists materials_brand_kind_idx on public.materials (brand, kind);
create index if not exists materials_deleted_idx on public.materials (deleted_at);
