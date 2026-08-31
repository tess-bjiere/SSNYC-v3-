-- Tess, 2026-08-28: "let's add a description of how the garment should fit into
-- the style details. This would be single sentence to a short paragraph."
--
-- The intended fit — how the garment SHOULD sit on the body, the design target.
-- Distinct from styles.fit_notes (the running story of what keeps going wrong
-- across rounds, shown as "Fit") and from a sample round's own fit notes (what a
-- given proto actually did). Plain text, additive and nullable; every style that
-- predates it reads blank.
alter table public.styles add column if not exists intended_fit text;
