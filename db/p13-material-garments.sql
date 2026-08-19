-- Tess, 2026-08-19: "add a dropdown for garments the fabric is being used for.
-- it would be the products listed on the website. a fabric should be able to be
-- used for multiple [garments]."
--
-- Additive, nullable-by-default: one jsonb array on each material holding the
-- product names it is used for. The products are the brand's styles (FRED's
-- website products), so the dropdown is sourced live from the styles table — no
-- second catalogue to keep in sync. A material can list many; the default is an
-- empty array.
--
-- Already applied to the FRED database (project vjiwcreytvmxvxasyvoo), where the
-- materials library lives. Run this by hand in the Supabase SQL editor of the
-- Loyalist project (axwavdjhzvtluvsixfjq) if materials are ever switched on
-- there too.

alter table public.materials
  add column if not exists garments jsonb not null default '[]'::jsonb;
