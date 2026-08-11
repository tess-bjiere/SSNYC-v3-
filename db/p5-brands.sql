-- Multi-brand, phase 1: the brand a row belongs to.
--
-- Tess, 2026-08-11: "I want to also make this usable for other brands (but they
-- have different references, vendors, styles, etc). the current set-up is for
-- SOUS SOUS. … Help me set gated versions for SOUS SOUS and Renggli."
--
-- SSYNC becomes one app serving several brands, each with its own references,
-- moodboards and styles. The tenant key is a brand SLUG on the three top-level
-- tables; the child tables (samples, versions, comments, style_references)
-- inherit their brand through the style they hang off, so they need no column.
--
-- styles already had a free-text `brand` (every row null, checked first), so it
-- is reused as the slug. references and moodboards gain one. All three get a
-- default of the primary brand so a row can never be born brandless — a null
-- brand is a row that belongs to no brand's view, i.e. a lost row, and the rule
-- everywhere in this tool is that nothing is lost. The create actions stamp the
-- ACTIVE brand explicitly; the default is only the floor.
--
-- Additive and nullable→backfilled. Every existing row is SOUS SOUS, which is
-- what the studio is today.
--
-- APPLIED to the live project on 2026-08-11.
alter table public.references add column if not exists brand text;
alter table public.moodboards add column if not exists brand text;

update public.references set brand = 'sous-sous' where brand is null;
update public.moodboards set brand = 'sous-sous' where brand is null;
update public.styles     set brand = 'sous-sous' where brand is null;

alter table public.references alter column brand set default 'sous-sous';
alter table public.moodboards alter column brand set default 'sous-sous';
alter table public.styles     alter column brand set default 'sous-sous';

-- The brand-scoped list queries ask "everything for this brand" on every page
-- load, so it is the cheap case.
create index if not exists references_brand_idx on public.references(brand);
create index if not exists moodboards_brand_idx on public.moodboards(brand);
create index if not exists styles_brand_idx     on public.styles(brand);
