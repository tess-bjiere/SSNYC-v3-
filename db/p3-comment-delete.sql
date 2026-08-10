-- Comments become soft-deletable.
--
-- Tess, 2026-08-06: "allow for comments to be deleted."
--
-- APPLIED to the live project on 2026-08-06. This file is the record of what
-- ran, kept beside the other schema changes so the shape of the database can
-- be read without opening Supabase.
--
-- Additive and nullable. Every existing row reads as NULL, which is exactly
-- what it already meant: not deleted. Nothing is dropped, nothing is rewritten,
-- and no existing query changes meaning until a reader opts in by adding
-- `.is("deleted_at", null)`.
--
-- Same shape as styles.deleted_at, references.deleted_at and
-- style_versions.deleted_at. The standing rule is that things stop being read,
-- they do not disappear -- so a deleted comment is still a row, still carries
-- its author and its words, and Restore is one UPDATE away.
alter table public.style_comments
  add column if not exists deleted_at timestamptz;

-- Partial index: the read path asks for the live comments on one style, and
-- this keeps that the cheap case as deleted rows accumulate.
create index if not exists style_comments_live_idx
  on public.style_comments (style_id, created_at)
  where deleted_at is null;
