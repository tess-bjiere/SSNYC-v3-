-- Tess, 2026-08-19: "add check for custom or stock and include on thumbnail".
--
-- Additive, nullable: one text column saying whether a material is 'stock' (an
-- off-the-shelf material) or 'custom' (developed / made-to-order). Unset until
-- someone marks it, so nothing is assumed for the rows already there.
--
-- Already applied to the FRED database (project vjiwcreytvmxvxasyvoo), where the
-- materials library lives. Run this by hand in the Supabase SQL editor of the
-- Loyalist project (axwavdjhzvtluvsixfjq) if materials are ever switched on
-- there too.

alter table public.materials
  add column if not exists sourcing text;   -- 'stock' | 'custom'
