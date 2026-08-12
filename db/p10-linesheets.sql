-- Linesheets (Tess, 2026-08-12: "i want to add a linesheet functionality to the
-- product side of the app. this is where a user can take a style in progress or
-- from the style library and add to a linesheet for the season or evergreen").
--
-- APPLIED 2026-08-12 via the Supabase MCP.
--
-- A linesheet is an ordered set of styles assembled for a season or as evergreen,
-- viewable as an assortment grid or one product per page and exported to PDF.
-- Modelled on moodboards: one row per linesheet, the ordered contents in a jsonb
-- `items` list, notes in a jsonb `notes` list (moodboard-style, filled in a later
-- phase). Per-brand, so it inherits the same simple RLS as moodboards.
--
-- Additive and non-destructive: nothing hard-deletes (archived + deleted_at), and
-- adding this table changes nothing that already exists. RLS mirrors the
-- moodboards policies in db/p0-rls.sql (signed-in read, signed-in write) so a
-- linesheet is readable and editable by the team exactly as a board is.

create table if not exists public.linesheets (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null default 'sous-sous',
  name        text not null,
  kind        text not null default 'seasonal',   -- 'seasonal' | 'evergreen'
  season      text,                                -- optional label, e.g. 'FW26'
  items       jsonb not null default '[]',         -- ordered [{ style_id, price?, note?, colorways? }]
  notes       jsonb not null default '[]',         -- moodboard-style notes (later phase)
  archived    boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists linesheets_brand_idx on public.linesheets(brand);

alter table public.linesheets enable row level security;
drop policy if exists "signed-in can read linesheets"  on public.linesheets;
drop policy if exists "signed-in can write linesheets" on public.linesheets;
create policy "signed-in can read linesheets"  on public.linesheets
  for select to authenticated using (true);
create policy "signed-in can write linesheets" on public.linesheets
  for all to authenticated using (true) with check (true);
