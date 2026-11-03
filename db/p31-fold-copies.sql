-- Fold the copied pictures back into one — people phase 2 (Tess, 2026-11-02:
-- "build phase 2", from the recommendation: "fold the existing copies back into
-- single images").
--
-- DATA ONLY — no schema change. APPLIED 2026-11-03 via the Supabase MCP.
--
-- Since phase 1 a picture shows on everyone tagged on it, so a second row of the
-- same picture only exists to be kept in step. Exactly two pictures were on two
-- live rows (checked by image across every live row of the brand):
--
--   Chris Colls's FRAME picture of Alexandra Agoston
--     keep   3d76e38b…  his row — credits both him and her, so it is already on
--                       both profiles, and it is the one Campaign has used since
--                       15 Sept (ref_kind Editorial)
--     trash  e7291f53…  her model row, borrowed from his by the deck import
--   Aaron Crossman's portrait of Lucinda Levant (the deck's crop)
--     keep   3bd611ab…  her model row — credits both her and him
--     trash  3f3a5fe8…  his roster row of the same file
--
-- Neither copy was pinned to a moodboard or linked to a style. Soft delete, so
-- both sit in Trash ("Untitled" there — Trash labels by brand). Their tags stay
-- on them, so Restore puts each back exactly where it was. The deck imports will
-- not re-add them: a person whose own rows are all in Trash counts as tidied on
-- purpose (lib/seedPlan.ts).

update public."references" set deleted_at = now()
 where id in ('e7291f53-06f3-4c57-941b-8bff77d68711', '3f3a5fe8-05b4-48c1-bfd3-440b5dfc0b49')
   and deleted_at is null;

-- ROLLBACK:
-- update public."references" set deleted_at = null
--  where id in ('e7291f53-06f3-4c57-941b-8bff77d68711', '3f3a5fe8-05b4-48c1-bfd3-440b5dfc0b49');
