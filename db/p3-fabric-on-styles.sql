-- Fabric on a style.
--
-- Tess, 2026-08-05: "add fabric under details as well".
--
-- The library has recorded fabric on a reference since the beginning. A style
-- in development did not, so the one question asked about every single sample
-- -- what is it being made in -- lived in free-text notes or in somebody's
-- head, and never made it onto an exported document.
--
-- Additive and nullable. No existing row is touched, nothing is dropped, and
-- every style that has no fabric reads "--" exactly as it did before.
--
-- APPLIED 2026-08-05 (migration add_fabric_to_styles). Kept here so the repo
-- carries the reason as well as the change.

alter table public.styles add column if not exists fabric text;
