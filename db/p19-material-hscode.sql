-- Tess, 2026-08-20: "add hs code to packaging fields".
--
-- The customs / Harmonized System classification code. Additive, nullable free
-- text (codes vary in length by country). Shown on the packaging form, but the
-- column is on the shared table so it can be surfaced for fabrics/trims later
-- without another migration.
--
-- Already applied to the FRED database (vjiwcreytvmxvxasyvoo) via MCP. It is also
-- folded into db/p18-materials-loyalist.sql, so a fresh Loyalist setup gets it;
-- run this one on Loyalist only if that table already exists there.

alter table public.materials
  add column if not exists hs_code text;
