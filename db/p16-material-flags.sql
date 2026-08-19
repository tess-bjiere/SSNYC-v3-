-- Tess, 2026-08-19: "Add ability to archive a fabric or a trim or packaging
-- item" + "Add ability to check 'current production' fabric ... should appear on
-- thumbnail".
--
-- Two additive boolean flags on a material, both defaulting false so every row
-- already there is neither archived nor in production until someone says so.
--   archived           — kept but out of the way; hidden from the default view,
--                        recoverable, distinct from Trash (which is deletion).
--   current_production — this material is the one currently being produced in;
--                        surfaced on its card.
--
-- Already applied to the FRED database (project vjiwcreytvmxvxasyvoo), where the
-- materials library lives. Run this by hand in the Supabase SQL editor of the
-- Loyalist project (axwavdjhzvtluvsixfjq) if materials are ever switched on
-- there too.

alter table public.materials
  add column if not exists archived boolean not null default false,
  add column if not exists current_production boolean not null default false;
