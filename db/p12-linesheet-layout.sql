-- Tess, 2026-08-24: "have options for page layouts" on the line-sheet detail
-- export.
--
-- The whole sheet exports in one of a few page layouts (flats / model / colorways)
-- — a sheet-level choice, so it is a column on the linesheet, not a per-item jsonb
-- field. Additive, nullable free text; the reader (lib/linesheet.normalizeLayout)
-- treats anything unrecognised or null as 'flats', so a sheet created before this
-- ran simply exports in the default layout until someone picks another.
--
-- Applied by hand in the Supabase SQL editor (SSYNC/Loyalist project
-- axwavdjhzvtluvsixfjq), then deploy.

alter table public.linesheets
  add column if not exists layout text;
