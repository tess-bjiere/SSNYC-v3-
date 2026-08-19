-- Tess, 2026-08-19: "can we add packaging tab to fabric and trims?"
--
-- Packaging is a third `kind` in the materials library alongside 'fabric' and
-- 'trim' — no schema change is needed for that (kind is already free text). This
-- adds the one column packaging needs that the others don't: its own type (poly
-- bag / box / mailer / hangtag / …). Its dimensions and make-up reuse the shared
-- `size` and `material` columns a trim already uses. Additive and nullable.
--
-- Already applied to the FRED database (project vjiwcreytvmxvxasyvoo), where the
-- materials library lives. Run this by hand in the Supabase SQL editor of the
-- Loyalist project (axwavdjhzvtluvsixfjq) if materials are ever switched on
-- there too.

alter table public.materials
  add column if not exists pack_type text;   -- 'poly bag' | 'box' | 'hangtag' | …
