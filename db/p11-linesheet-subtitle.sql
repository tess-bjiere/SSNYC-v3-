-- Rename the linesheet's optional label from "season" to "subtitle" (Tess,
-- 2026-08-12: "rename to subtitle") — it rides on evergreen sheets too now, where
-- "season" was the wrong word.
--
-- APPLIED 2026-08-12 via the Supabase MCP.
--
-- Additive, not a rename in place: a new nullable column, and the old `season`
-- column is kept (a retired field keeps its column here). Readers prefer
-- `subtitle` and fall back to `season`, so any linesheet created in the brief
-- window it wrote `season` still shows its label.

alter table public.linesheets add column if not exists subtitle text;
