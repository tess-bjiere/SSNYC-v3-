-- Per-board colour palettes (Tess, 2026-09-09: "color palettes should be saved
-- to a season and then allowed to be added to a moodboard -- not just applied to
-- all moodboards as many of these would be seasonal").
--
-- The brand's palette (brands.palette) becomes a LIBRARY — one palette per season
-- plus an evergreen one, shape { "evergreen": [...], "seasons": { "FW26": [...] } }.
-- That reshape needs no DDL: the column is already jsonb, and normalizePaletteLibrary
-- migrates the old { seasonal, evergreen } value in place on the first save.
--
-- This migration is only the board side: which palettes a board has been given,
-- as a list of keys ("evergreen" and/or season names). Additive and nullable —
-- a board with no column reads as an empty list and shows no palette, so the app
-- renders fine before this is run (only adding/removing a palette on a board
-- needs it). Nothing is deleted; removing a palette from a board just drops its
-- key from this array. The library itself stays on the brand row.
--
-- Run by hand in the Supabase SQL editor.

alter table public.moodboards add column if not exists palettes jsonb not null default '[]'::jsonb;
