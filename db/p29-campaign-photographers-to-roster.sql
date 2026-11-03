-- Photographers out of Campaign (Tess, 2026-11-02: "right now i have some
-- photographer living under campaign and some under photographer. they should all
-- live under photographer").
--
-- DATA ONLY — no schema change. APPLIED 2026-11-02 via the Supabase MCP.
--
-- Before this, 12 of Campaign's 13 live images were a photographer's own work,
-- saved 15–23 Sept as a way of keeping a photographer (Chris Colls for FRAME,
-- Mac Scott for UVU, Ryan Marie Helfant for NY Ballet…). The directory reads
-- Campaign credits AND the roster, so six of those people showed twice: once in
-- their city from the deck, and again under "Unspecified city" from the Campaign
-- image, which had no location.
--
-- What this does:
--   1. retypes those 12 rows 'editorial' → 'roster'. They leave the Campaign wall
--      and stay on the photographer's profile, where they already showed. Every
--      other field — credits, notes, ref_kind, image — is untouched, so moving one
--      back is a one-word change. Moodboard pins look rows up by id regardless of
--      type, so the one pin on "Fall 2027" still draws.
--   2. fills a BLANK location from the person's own roster city, for the six who
--      have one, so each is one card in their city instead of two. On a roster
--      row location means where they are based, not where a picture was shot.
--      Jamie Heath's image keeps "Paris" (it was filled in), so she still shows in
--      Paris and Sydney; Adam Peter, Mac Scott and Sarah Blais have no known city
--      and stay under Unspecified.
--
-- Left in Campaign: the Zara styling image (no photographer credit).
-- Not touched: the Models row for Alexandra Agoston, which is its own copy of the
-- Chris Colls picture (e7291f53…).

begin;

update public."references"
   set type = 'roster'
 where brand = 'sous-sous'
   and type = 'editorial'
   and deleted_at is null
   and id in (
     '73d6045e-6d6c-4633-bda9-b695cf8bf2ac', -- Ryan Marie Helfant · New York Ballet
     '9785f2a3-05c5-4782-b651-bd3cc9f0aea5', -- Bono Melendrez
     '5e51a676-39ba-4c7d-a7e2-e7b6e81769f0', -- James Brodribb
     'fdc01ac8-8203-4fae-938b-70c42bb692d6', -- James Ari King · Bottega Veneta
     '3d76e38b-8926-444a-9f9a-eeb5dae74fae', -- Chris Colls · FRAME
     '3d3e940c-10aa-4c1f-89bd-04c16408dcb8', -- Boris Lutters · Martan
     '1f0549a6-50e1-4f93-b052-db8edb21b274', -- Adam Peter · Harper's Bazaar France
     '37e6c5b0-a9d1-4dd9-8227-062a977c6f84', -- Jamie Heath
     '43f4ca4d-c4f4-4a26-bbbf-72c177f445a9', -- Sarah Blais · The Frankie Shop
     '7599cc50-e85a-4a4c-9cb5-be77c3528466', -- Drew Vickers · PRINT
     '4bc018d6-270a-4855-9d2a-1c14cd65b95e', -- Emily Lipson
     'b73b2e6c-0364-4ae8-b9da-5ea2e03a67d5'  -- Mac Scott · UVU
   );

update public."references" r
   set location = v.city
  from (values
     ('9785f2a3-05c5-4782-b651-bd3cc9f0aea5'::uuid, 'New York'),  -- Bono Melendrez
     ('5e51a676-39ba-4c7d-a7e2-e7b6e81769f0'::uuid, 'New York'),  -- James Brodribb
     ('3d76e38b-8926-444a-9f9a-eeb5dae74fae'::uuid, 'New York'),  -- Chris Colls
     ('4bc018d6-270a-4855-9d2a-1c14cd65b95e'::uuid, 'New York'),  -- Emily Lipson
     ('3d3e940c-10aa-4c1f-89bd-04c16408dcb8'::uuid, 'Amsterdam'), -- Boris Lutters
     ('7599cc50-e85a-4a4c-9cb5-be77c3528466'::uuid, 'Paris')      -- Drew Vickers
  ) as v(id, city)
 where r.id = v.id
   and (r.location is null or btrim(r.location) = '');

commit;

-- ROLLBACK (puts all 12 back on Campaign exactly as they were; the six
-- locations were blank before):
--
-- begin;
-- update public."references" set location = null
--  where id in ('9785f2a3-05c5-4782-b651-bd3cc9f0aea5','5e51a676-39ba-4c7d-a7e2-e7b6e81769f0',
--               '3d76e38b-8926-444a-9f9a-eeb5dae74fae','4bc018d6-270a-4855-9d2a-1c14cd65b95e',
--               '3d3e940c-10aa-4c1f-89bd-04c16408dcb8','7599cc50-e85a-4a4c-9cb5-be77c3528466');
-- update public."references" set type = 'editorial'
--  where id in ('73d6045e-6d6c-4633-bda9-b695cf8bf2ac','9785f2a3-05c5-4782-b651-bd3cc9f0aea5',
--               '5e51a676-39ba-4c7d-a7e2-e7b6e81769f0','fdc01ac8-8203-4fae-938b-70c42bb692d6',
--               '3d76e38b-8926-444a-9f9a-eeb5dae74fae','3d3e940c-10aa-4c1f-89bd-04c16408dcb8',
--               '1f0549a6-50e1-4f93-b052-db8edb21b274','37e6c5b0-a9d1-4dd9-8227-062a977c6f84',
--               '43f4ca4d-c4f4-4a26-bbbf-72c177f445a9','7599cc50-e85a-4a4c-9cb5-be77c3528466',
--               '4bc018d6-270a-4855-9d2a-1c14cd65b95e','b73b2e6c-0364-4ae8-b9da-5ea2e03a67d5');
-- commit;
