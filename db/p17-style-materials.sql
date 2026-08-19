-- Tess, 2026-08-19: "Add Ability to add fabric and trims from library to a style
-- in development or production."
--
-- A style-level list of the materials it is made in, mirroring
-- style_samples.material_ids (which records what a single sample ROUND was sewn
-- in). Additive jsonb array of materials.id, default empty.
--
-- Materials are a FRED-only library, so this is only used on FRED — already
-- applied there (project vjiwcreytvmxvxasyvoo) via MCP. Running it on the
-- Loyalist project (axwavdjhzvtluvsixfjq) is harmless (an unused column) but not
-- required; the style Materials section only renders where the library exists.

alter table public.styles
  add column if not exists material_ids jsonb not null default '[]'::jsonb;
