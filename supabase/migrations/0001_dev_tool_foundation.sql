-- SSYNC Development Tool — ADDITIVE foundation schema.
-- STATUS: already applied to the live project (axwavdjhzvtluvsixfjq) on 2026-07-24.
-- Kept here for your records / for setting up a copy of the database.
--
-- Non-destructive: creates NEW tables only. Existing references / moodboards / settings
-- tables and their data are NOT touched. Policies match the existing permissive posture
-- (to public, using true) so both the current app and this new app work during transition.

create table if not exists public.styles (
  id uuid primary key default gen_random_uuid(),
  style_no text,
  name text not null,
  category text,
  garment text,
  designer text,
  brand text,
  status text not null default 'inspo',      -- inspo | development | production | archived
  stage text,
  evergreen boolean not null default false,
  season text,
  factory text,
  cover_image text,
  tech_pack_url text,
  notes text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.style_versions (
  id uuid primary key default gen_random_uuid(),
  style_id uuid references public.styles(id) on delete cascade,
  version_no int not null default 1,
  changes text,
  season text,
  image text,
  is_ai_generated boolean default false,
  notes text,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists public.style_samples (
  id uuid primary key default gen_random_uuid(),
  style_id uuid references public.styles(id) on delete cascade,
  round text not null,                        -- proto1 | proto2 | proto3 | sms | pps1 | pps2 | bulk
  factory text,
  submitted_date date,
  received_date date,
  status text,
  comments text,
  created_at timestamptz default now()
);

create table if not exists public.style_comments (
  id uuid primary key default gen_random_uuid(),
  style_id uuid references public.styles(id) on delete cascade,
  version_id uuid references public.style_versions(id) on delete set null,
  author text,
  body text not null,
  status text default 'open',                 -- open | received | updated
  created_at timestamptz default now()
);

-- Links existing references to a style WITHOUT altering the references table.
create table if not exists public.style_references (
  style_id uuid references public.styles(id) on delete cascade,
  reference_id uuid references public.references(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (style_id, reference_id)
);

-- Guest allowlist for emails outside @theloyalist.com.
create table if not exists public.app_allowlist (
  email text primary key,
  note text,
  added_by text,
  created_at timestamptz default now()
);

do $$
declare t text;
begin
  foreach t in array array['styles','style_versions','style_samples','style_comments','style_references','app_allowlist']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$create policy "team can read %1$s" on public.%1$I for select to public using (true);$f$, t);
    execute format($f$create policy "team can write %1$s" on public.%1$I for all to public using (true) with check (true);$f$, t);
  end loop;
end $$;
