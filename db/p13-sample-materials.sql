-- Tess, 2026-08-19: "on the sample profile -- we should be able to link the
-- fabric and trims".
--
-- A sample round already records its material in words (material_type,
-- material_contents, material_supplier, material_notes). Those stay: plenty of
-- rounds run on something that was never entered into the library, and
-- lib/sampleCycle.ts and both exports read them. This is additive — a link
-- ALONGSIDE the words, not instead of them.
--
-- jsonb array of materials.id, mirroring material_orders.items, which is the
-- shape this codebase already uses for "a list of materials". No qty here: an
-- order needs quantities, a sample round only needs to say which materials it
-- was made in. Defaults to '[]' and is nullable, so every existing row is
-- already valid and nothing has to be backfilled.
--
-- No foreign key, deliberately. Materials soft-delete via deleted_at rather
-- than disappearing, and a round should keep pointing at the fabric it was
-- actually made in even after that fabric is retired from the library. The
-- reader resolves ids against the library and simply shows nothing for one it
-- cannot find.
--
-- APPLY TO THE FRED DATABASE ONLY (project vjiwcreytvmxvxasyvoo). The materials
-- table itself has never been applied to the Loyalist project
-- (axwavdjhzvtluvsixfjq) — see db/p11-materials.sql — and the library is hidden
-- on the SSYNC deploy, so SOUS SOUS and Renggli have nothing to link to. The
-- picker only renders when APP.id is "fred"; running this on Loyalist would add
-- a column nothing writes.
--
-- APPLIED to FRED (vjiwcreytvmxvxasyvoo) 2026-08-20 via MCP. It had been missed
-- when the round material picker shipped, and because sampleFields() writes
-- material_ids on FRED, every add/update sample was silently rejected for the
-- missing column until this ran ("when i add a sample round its not saving").
-- Loyalist (SOUS SOUS / Renggli) does not get this column — see the note above.

alter table public.style_samples
  add column if not exists material_ids jsonb not null default '[]'::jsonb;

comment on column public.style_samples.material_ids is
  'Array of materials.id this round was made in. Additive to the material_* text columns, which remain the record for materials that are not in the library.';
