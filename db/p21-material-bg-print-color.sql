-- Tess, 2026-08-20: "add background colour and print colour as field on packaging
-- and trims".
--
-- A trim or a printed piece of packaging is often two colours — the stock/base it
-- is made in and the ink printed on it. Record both, kept separate from the shared
-- `color` so a printed hangtag can carry the base and the print at once. Additive,
-- nullable free text; shown only on the trim and packaging forms.
--
-- Already applied to the FRED database (vjiwcreytvmxvxasyvoo) via MCP. It is also
-- folded into db/p18-materials-loyalist.sql, so a fresh Loyalist setup gets it;
-- run this one on Loyalist only if that table already exists there.

alter table public.materials
  add column if not exists background_color text,
  add column if not exists print_color text;
