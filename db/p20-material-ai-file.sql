-- Tess, 2026-08-20: "add place for ai file on each profile so you can easily send
-- the link to the file when putting together an order and saving as a pdf or
-- sending as an email".
--
-- A link to the material's Illustrator artwork. Additive, nullable free text (it
-- holds a URL). Shown as a clickable link on the profile and carried onto the
-- material order so the PDF / email sent to a supplier includes it.
--
-- Already applied to the FRED database (vjiwcreytvmxvxasyvoo) via MCP. It is also
-- folded into db/p18-materials-loyalist.sql, so a fresh Loyalist setup gets it;
-- run this one on Loyalist only if that table already exists there.

alter table public.materials
  add column if not exists ai_file text;
