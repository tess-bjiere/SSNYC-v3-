-- ---------------------------------------------------------------------------
-- P3 development-tool refinements — the storage half
--
-- Announced and approved by Tess, 2026-08-04.
--
-- Six additions. Every one of them is a NEW column. Nothing existing is
-- renamed, retyped, dropped or rewritten, so no row in this database changes
-- when this runs and no query that works today stops working.
--
-- Why each one exists, in the words of the request that produced it:
--
--   material_type / material_contents
--       "add material type and contents under raw materials". Two fields, not
--       one, because "Cotton jersey" and "94% cotton, 6% elastane" are asked
--       for by different people — the designer wants the first, the factory
--       and the customs paperwork want the second.
--
--   material_notes
--       "add a section for notes on materials (this can be where there are any
--       dates added in for materials, etc)". The four material_*_date columns
--       stay exactly where they are and keep whatever they hold; the UI simply
--       stops offering them as inputs. Free text replaces them because a date
--       nobody fills in is worse than a sentence somebody does.
--
--   eta_date
--       "if the sample has not been received, you can add an ETA". This is the
--       SAMPLE's expected arrival from the factory. It is deliberately NOT
--       material_eta_date, which is the fabric's arrival at the factory — a
--       different leg of the same cycle, weeks apart.
--
--   photos (jsonb)
--       "add the ability to add additional model shots", attached to the round
--       rather than the style, so the 1st proto's shots sit with the 1st proto.
--       Same shape as styles.photos: a map of caption-keyed URLs, read through
--       a normalizer that ignores anything it does not recognise. Defaulted to
--       '{}' and NOT NULL so no reader ever has to handle a null map.
--
--   parent_id
--       "users should be able to reply to comments". ON DELETE SET NULL, not
--       CASCADE: deleting a comment must never take somebody else's reply with
--       it. An orphaned reply floats up to the top level, which is visible and
--       recoverable. Nothing in this app deletes a comment today; this is the
--       column refusing to be the thing that makes it destructive later.
--
-- Every statement is IF NOT EXISTS. Running this twice is a no-op.
-- ---------------------------------------------------------------------------

begin;

alter table public.style_samples add column if not exists material_type     text;
alter table public.style_samples add column if not exists material_contents text;
alter table public.style_samples add column if not exists material_notes    text;
alter table public.style_samples add column if not exists eta_date          date;
alter table public.style_samples add column if not exists photos            jsonb not null default '{}'::jsonb;

alter table public.style_comments add column if not exists parent_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'style_comments_parent_id_fkey'
  ) then
    alter table public.style_comments
      add constraint style_comments_parent_id_fkey
      foreign key (parent_id) references public.style_comments(id) on delete set null;
  end if;
end $$;

create index if not exists style_comments_parent_idx on public.style_comments(parent_id);

commit;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and (table_name, column_name) in (
--          ('style_samples','material_type'), ('style_samples','material_contents'),
--          ('style_samples','material_notes'), ('style_samples','eta_date'),
--          ('style_samples','photos'),         ('style_comments','parent_id'))
--  order by table_name, column_name;

-- ---------------------------------------------------------------------------
-- Rollback — one paste, and the database is exactly as it was.
--
-- Note what this costs: dropping these columns destroys whatever has been
-- typed into them since. That is fine on the day it runs and not fine a month
-- later. If it is a month later, leave the columns and stop reading them.
-- ---------------------------------------------------------------------------
-- begin;
-- drop index if exists style_comments_parent_idx;
-- alter table public.style_comments drop constraint if exists style_comments_parent_id_fkey;
-- alter table public.style_comments drop column if exists parent_id;
-- alter table public.style_samples  drop column if exists photos;
-- alter table public.style_samples  drop column if exists eta_date;
-- alter table public.style_samples  drop column if exists material_notes;
-- alter table public.style_samples  drop column if exists material_contents;
-- alter table public.style_samples  drop column if exists material_type;
-- commit;
