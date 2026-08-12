-- Moodboard colour palette (Tess, 2026-08-12: "add color palette section to
-- moodboard -- allows user to fill in seasonal and evergreen color swatches /
-- pantones for easy reference").
--
-- APPLIED 2026-08-12 via the Supabase MCP.
--
-- One nullable jsonb column on the existing brands table. The palette is a brand
-- property, not a board's — "evergreen" colours are the permanent brand set — so
-- it rides the row the brand already has rather than a new table with its own
-- RLS. brands already reads public and writes for any signed-in user (p8), which
-- is exactly what the moodboard needs, so nothing else changes.
--
-- Additive and nullable: a brand with no palette reads as null and the app shows
-- an empty palette. Shape, when set:
--   { "seasonal":  [ { "hex": "#aabbcc", "name": "PANTONE 18-1234" }, ... ],
--     "evergreen": [ { "hex": "#000000", "name": "Black" }, ... ] }

alter table public.brands add column if not exists palette jsonb;
