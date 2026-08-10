-- Comments scoped to a sample round (P3 refinement, Tess 2026-08-04).
--
-- "comments should be linked to specific sample or general profile of style."
--
-- One nullable column. Additive only: nothing is dropped, nothing is rewritten,
-- and every comment that exists today keeps sample_id = null, which is exactly
-- what it already means — a comment about the style as a whole. The scope is a
-- thing a comment can now optionally have, not a thing it now has to have.
--
-- ON DELETE SET NULL rather than CASCADE, deliberately. If a sample round is
-- ever removed, the conversation about it does not go with it — the comments
-- fall back to being general comments on the style. This tool does not destroy
-- something somebody typed because the thing they typed it against moved on.
--
-- The index exists because the round card asks "how many comments on this
-- round?" once per round on every profile render.

alter table public.style_comments
  add column if not exists sample_id uuid
  references public.style_samples(id) on delete set null;

create index if not exists style_comments_sample_id_idx
  on public.style_comments (sample_id);

comment on column public.style_comments.sample_id is
  'The sample round this comment is about. Null = a general comment on the style.';
