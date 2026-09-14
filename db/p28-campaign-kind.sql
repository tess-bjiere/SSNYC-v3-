-- Campaign reference kind (Tess, 2026-09-14: "on campaign, option to sort by
-- editorial / image references or styling references. sorting by designer is less
-- important").
--
-- A per-image label on campaign rows (type='editorial') saying whether it is an
-- Editorial (image / photography) reference or a Styling reference, so the
-- Campaign grid can filter by it — tabs All / Editorial / Styling.
--
-- Additive and nullable: existing campaign images read as untagged and show under
-- All until they are labelled. Library references never set it. Stored as the
-- label itself ("Editorial" / "Styling"); it is free text underneath and is
-- normalised (case-folded, unknown → untagged) in lib/campaign.ts. Run by hand in
-- the Supabase SQL editor.

alter table public."references" add column if not exists ref_kind text;
