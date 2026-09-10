-- Favorite references (Tess, 2026-09-09: "add functionality for arielle to star
-- favorite references and then view favorites").
--
-- One SHARED favorites list, not per-user (Tess chose "one shared list"): a star
-- is a property of the reference itself, so a single boolean on the row is all it
-- needs — anyone can star, everyone sees the same stars, and the "★ Favorites"
-- filter shows where it is true. No join table, no per-user rows.
--
-- Additive and nullable-safe: a row with no column reads as not-favorited and the
-- library renders fine before this is run — only starring needs it (the toggle
-- no-ops until then, the same graceful path the palette takes). Nothing is ever
-- deleted; un-starring just sets it back to false.
--
-- `references` is a reserved word, so it is quoted. Run by hand in the Supabase
-- SQL editor.

alter table public."references" add column if not exists favorite boolean not null default false;
