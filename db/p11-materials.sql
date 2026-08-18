-- Tess, 2026-08-18: "i am going to want to build library for fabrics and trims".
--
-- A new, additive table — a materials library, sibling to the references
-- library. One table with a `kind` ('fabric' | 'trim'), the shared fields both
-- need, plus the few specific to each. Soft-delete like everything else.
--
-- Already applied to the FRED database (project vjiwcreytvmxvxasyvoo). Run this
-- by hand in the Supabase SQL editor of the Loyalist project
-- (axwavdjhzvtluvsixfjq) to switch the page on there too — until then the
-- /materials page renders its empty state on SSYNC (the reader tolerates the
-- missing table), so nothing breaks before you run it.

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'sous-sous',
  kind text not null default 'fabric',        -- 'fabric' | 'trim'
  name text not null,
  supplier text,
  supplier_ref text,
  composition text,
  color text,
  color_hex text,
  weight text,          -- fabric: GSM / oz
  width text,           -- fabric: cm / in
  construction text,    -- fabric: woven / knit / …
  finish text,          -- fabric: washed / brushed / …
  trim_type text,       -- trim: button / zip / label / …
  size text,            -- trim
  material text,        -- trim: brass / horn / …
  price text,
  moq text,
  lead_time text,
  notes text,
  image_url text,
  thumb_url text,
  extra_images jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

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
