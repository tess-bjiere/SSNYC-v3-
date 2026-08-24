-- Colour standards (Tess, 2026-08-23: "can you create a color standard that
-- lives in the tool for fred?" — FRED-only, like the material orders drawn from
-- the same library).
--
-- A colour standard is the approved PHYSICAL reference a material's colour is
-- matched to: a signed, dated swatch held in the studio. Every column here is
-- metadata pointing at that object. `hex` is a screen approximation for the chip
-- and is explicitly NOT the standard — monitors and dye lots do not agree.
--
-- One master per colour, approved separately on every material: the same recipe
-- on 270 GSM rib, 155 GSM rib, poplin and a knitted sock will not match, because
-- fibre, construction and surface change how light comes back. So the approvals
-- ride the standard as a jsonb list with one entry per material, the same shape
-- material_orders uses for its lines (db/p12):
--
--   [ { "material_id": "…", "status": "pending|approved|rejected",
--       "judged_on": "2026-08-23", "judged_by": "…", "light": "Daylight",
--       "lab_dip_url": "…", "note": "…" }, … ]
--
-- Deliberately NOT here: per-delivery approval history. This holds current state
-- per material; a `deliveries` list can be added inside each entry later without
-- restructuring.
--
-- APPLY: FRED (vjiwcreytvmxvxasyvoo) via the Supabase MCP. NOT applied to the
-- Loyalist DB — the feature is FRED-only and every read tolerates the table
-- being absent, so SSYNC is unaffected.

create table if not exists public.color_standards (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'fred',
  name text not null,
  label text,
  kind text,
  pantone text,
  hex text,
  swatch_url text,
  master_location text,
  approved_on date,
  approved_by text,
  spec text,
  brightener boolean,
  notes text,
  approvals jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  deleted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Column guards, in case the table already exists from an earlier partial run.
alter table public.color_standards add column if not exists label text;
alter table public.color_standards add column if not exists kind text;
alter table public.color_standards add column if not exists pantone text;
alter table public.color_standards add column if not exists hex text;
alter table public.color_standards add column if not exists swatch_url text;
alter table public.color_standards add column if not exists master_location text;
alter table public.color_standards add column if not exists approved_on date;
alter table public.color_standards add column if not exists approved_by text;
alter table public.color_standards add column if not exists spec text;
alter table public.color_standards add column if not exists brightener boolean;
alter table public.color_standards add column if not exists notes text;
alter table public.color_standards add column if not exists approvals jsonb not null default '[]'::jsonb;
alter table public.color_standards add column if not exists archived boolean not null default false;
alter table public.color_standards add column if not exists deleted_at timestamptz;

alter table public.color_standards enable row level security;
drop policy if exists color_standards_read on public.color_standards;
drop policy if exists color_standards_insert on public.color_standards;
drop policy if exists color_standards_update on public.color_standards;
create policy color_standards_read on public.color_standards for select to authenticated using (true);
create policy color_standards_insert on public.color_standards for insert to authenticated with check (true);
create policy color_standards_update on public.color_standards for update to authenticated using (true);

-- The grant FRED's tables have needed every time; RLS alone is not enough here.
grant all on public.color_standards to anon, authenticated, service_role;

create index if not exists color_standards_brand_idx on public.color_standards (brand);
create index if not exists color_standards_deleted_idx on public.color_standards (deleted_at);
